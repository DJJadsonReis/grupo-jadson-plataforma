import { ConflictException } from "@nestjs/common";
import { DictationController } from "./dictation.controller";
import { DictationService } from "./dictation.service";
import { MODEL_SIZE_MB, type DictationModel, type ModelStatus, type TranscriptionOptions } from "./transcriber";
import { TransformersTranscriber } from "./transcriber";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { ApiTokenGuard } from "../auth/api-token.guard";

class FakeModel implements DictationModel {
  current: ModelStatus = { state: "missing", sizeMb: MODEL_SIZE_MB };
  calls: Array<{ samples: Float32Array; options: TranscriptionOptions }> = [];
  result: (samples: Float32Array) => Promise<string> = async () => "texto de teste";
  getStatus() { return { ...this.current }; }
  startDownload() { this.current = { state: "downloading", progress: 0, sizeMb: MODEL_SIZE_MB }; return this.getStatus(); }
  async transcribe(samples: Float32Array, options: TranscriptionOptions) { this.calls.push({ samples, options }); return this.result(samples); }
}

function encoded(values: number[]): string {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes.toString("base64");
}

describe("DictationController", () => {
  let model: FakeModel;
  let service: DictationService;
  let controller: DictationController;
  beforeEach(() => { model = new FakeModel(); service = new DictationService(model); controller = new DictationController(service); });

  it("reports status and starts one model download with progress", () => {
    expect(controller.status()).toEqual({ state: "missing", sizeMb: MODEL_SIZE_MB });
    expect(controller.download()).toEqual({ state: "downloading", progress: 0, sizeMb: MODEL_SIZE_MB });
    model.current = { state: "downloading", progress: 42, sizeMb: MODEL_SIZE_MB };
    expect(controller.status()).toMatchObject({ state: "downloading", progress: 42 });
  });

  it("reports progress, completes once, and exposes download failure for retry", async () => {
    let release!: (pipeline: unknown) => void;
    const loading = new TransformersTranscriber(() => new Promise((resolve) => { release = resolve; }));
    expect(loading.startDownload()).toMatchObject({ state: "downloading", progress: 0 });
    expect(loading.startDownload()).toMatchObject({ state: "downloading" });
    await new Promise((resolve) => setImmediate(resolve));
    release(async () => ({ text: "teste" }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(loading.getStatus()).toMatchObject({ state: "ready", progress: 100 });
    const failed = new TransformersTranscriber(async () => { throw new Error("falha marcada de teste"); });
    failed.startDownload();
    await new Promise((resolve) => setImmediate(resolve));
    expect(failed.getStatus()).toMatchObject({ state: "error", error: "falha marcada de teste" });
    expect(failed.startDownload()).toMatchObject({ state: "downloading" });
  });

  it("transcribes local samples in Portuguese after the model is ready", async () => {
    model.current = { state: "ready", sizeMb: MODEL_SIZE_MB };
    const samples = Array.from({ length: 48_000 }, (_, index) => Math.sin(index / 50) * 0.1);
    await expect(controller.transcribe({ samples: encoded(samples) })).resolves.toEqual({ text: "texto de teste" });
    expect(model.calls[0]!.options).toEqual({ language: "portuguese", task: "transcribe" });
    expect(model.calls[0]!.samples).toHaveLength(48_000);
  });

  it.each([
    ["base64 inválido", "bad!"],
    ["bytes fora de múltiplo de quatro", Buffer.from([1]).toString("base64")],
    ["zero amostras", ""],
    ["NaN", encoded([Number.NaN])],
    ["Infinity", encoded([Infinity])],
    ["mais de 30 segundos", encoded(new Array(480_001).fill(0))],
  ])("rejects invalid audio with 400: %s", async (_label, samples) => {
    await expect(controller.transcribe({ samples })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects audio before model installation", async () => {
    await expect(controller.transcribe({ samples: encoded([0.1]) })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects concurrent transcriptions as busy", async () => {
    model.current = { state: "ready", sizeMb: MODEL_SIZE_MB };
    let finish!: (text: string) => void;
    model.result = () => new Promise<string>((resolve) => { finish = resolve; });
    const first = controller.transcribe({ samples: encoded([0.1]) });
    await Promise.resolve();
    await expect(controller.transcribe({ samples: encoded([0.2]) })).rejects.toMatchObject({ status: 429, response: { code: "BUSY" } });
    finish("ok");
    await first;
  });

  it("does not write received audio to disk", async () => {
    const fs = await import("node:fs");
    const writes = [jest.spyOn(fs, "writeFileSync"), jest.spyOn(fs, "writeFile"), jest.spyOn(fs, "createWriteStream")];
    model.current = { state: "ready", sizeMb: MODEL_SIZE_MB };
    await controller.transcribe({ samples: encoded([0.1]) });
    for (const write of writes) { expect(write).not.toHaveBeenCalled(); write.mockRestore(); }
  });
});

describe("Whisper real model integration", () => {
  const enabled = process.env.DICTATION_MODEL_TEST === "1";
  (enabled ? it : it.skip)("loads the model and transcribes generated silence", async () => {
    const { TransformersTranscriber } = await import("./transcriber");
    const model = new TransformersTranscriber();
    model.startDownload();
    for (let attempt = 0; attempt < 180 && model.getStatus().state === "downloading"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(model.getStatus().state).toBe("ready");
    await expect(model.transcribe(new Float32Array(48_000), { language: "portuguese", task: "transcribe" })).resolves.toEqual(expect.any(String));
  }, 200_000);
});

describe("Dictation API authentication", () => {
  it("rejects a stale desktop token, then accepts the synchronized token across status, download, and transcription", async () => {
    const previousToken = process.env.API_TOKEN;
    const backendToken = "b".repeat(64);
    const appToken = "a".repeat(64);
    process.env.API_TOKEN = backendToken;
    const model = new FakeModel();
    const module = await Test.createTestingModule({ controllers: [DictationController], providers: [{ provide: DictationService, useValue: new DictationService(model) }] }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalGuards(new ApiTokenGuard(new Reflector()));
    try {
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as { port: number };
      const base = `http://127.0.0.1:${address.port}/api/v1/dictation`;
      const staleHeaders = { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" };
      const headers = { Authorization: `Bearer ${backendToken}`, "Content-Type": "application/json" };
      const statusUrl = `${base}/status`;
      const stale = await fetch(statusUrl, { headers: staleHeaders });
      expect(stale.status).toBe(401);
      await expect(stale.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
      const status = await fetch(statusUrl, { headers });
      expect(status.status).toBe(200);
      await expect(status.json()).resolves.toMatchObject({ state: "missing", sizeMb: MODEL_SIZE_MB });
      const refusedMidSession = await fetch(`${base}/model/download`, { method: "POST", headers: staleHeaders });
      expect(refusedMidSession.status).toBe(401);
      await expect(refusedMidSession.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
      const download = await fetch(`${base}/model/download`, { method: "POST", headers });
      expect(download.status).toBe(202);
      await expect(download.json()).resolves.toMatchObject({ state: "downloading" });
      model.current = { state: "ready", sizeMb: MODEL_SIZE_MB };
      const transcribe = await fetch(`${base}/transcribe`, { method: "POST", headers, body: JSON.stringify({ samples: encoded([0.1]) }) });
      expect(transcribe.status).toBe(201);
      await expect(transcribe.json()).resolves.toEqual({ text: "texto de teste" });
    } finally {
      await app.close();
      if (previousToken === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = previousToken;
    }
  });
});
