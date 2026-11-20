import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODEL_ID, TransformersTranscriber, verifyBundledModel } from "./transcriber";

describe("bundled dictation model", () => {
  let directory: string;
  let modelDirectory: string;
  const files = [{ name: "config.json", contents: Buffer.from("fake-config") }, { name: "weights.onnx", contents: Buffer.from("fake-weights") }];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "gj-dictation-"));
    modelDirectory = join(directory, MODEL_ID);
    await mkdir(modelDirectory, { recursive: true });
    const entries = [];
    for (const file of files) {
      await writeFile(join(modelDirectory, file.name), file.contents);
      entries.push({ name: file.name, size: file.contents.byteLength, sha256: createHash("sha256").update(file.contents).digest("hex") });
    }
    await writeFile(join(modelDirectory, "manifest.json"), JSON.stringify({ model: "onnx-community/whisper-base", files: entries }));
  });

  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("verifies manifest entries and preloads without requesting a download", async () => {
    const options: Array<{ localModelPath?: string; allowRemoteModels: boolean }> = [];
    const transcriber = new TransformersTranscriber(async (progress, loadOptions) => { progress(40); options.push(loadOptions); return async () => ({ text: "ok" }); }, directory);
    expect(await verifyBundledModel(directory)).toBe(true);
    const preload = transcriber.preloadBundledModel();
    expect(transcriber.getStatus().state).toBe("downloading");
    await preload;
    expect(transcriber.getStatus()).toMatchObject({ state: "ready", progress: 100 });
    expect(options).toEqual([{ localModelPath: directory, allowRemoteModels: false }]);
    const packageResolvedConfig = join(directory, MODEL_ID, "config.json");
    await expect(import("node:fs/promises").then(({ access }) => access(packageResolvedConfig))).resolves.toBeUndefined();
    expect(transcriber.startDownload()).toMatchObject({ state: "ready" });
    await expect(transcriber.transcribe(new Float32Array([0]), { language: "portuguese", task: "transcribe" })).resolves.toBe("ok");
  });

  it("rejects corrupted model files and keeps the download fallback available", async () => {
    await writeFile(join(modelDirectory, "weights.onnx"), "changed");
    const transcriber = new TransformersTranscriber(async () => async () => ({ text: "ok" }), directory);
    const manifestPath = join(modelDirectory, "manifest.json");
    const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestPath, "utf8"));
    manifest.files[0].sha256 = "0".repeat(64);
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect(await verifyBundledModel(directory)).toBe(false);
    const preload = transcriber.preloadBundledModel();
    expect(transcriber.getStatus().state).toBe("downloading");
    await preload;
    expect(transcriber.getStatus().state).toBe("missing");
    expect(transcriber.startDownload().state).toBe("downloading");
  });

  it("does not accept the legacy model files at the resource root", async () => {
    await rm(modelDirectory, { recursive: true, force: true });
    for (const file of files) await writeFile(join(directory, file.name), file.contents);
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ model: MODEL_ID, files: files.map((file) => ({ name: file.name, size: file.contents.byteLength, sha256: createHash("sha256").update(file.contents).digest("hex") })) }));
    const transcriber = new TransformersTranscriber(async () => async () => ({ text: "ok" }), directory);
    await transcriber.preloadBundledModel();
    expect(transcriber.getStatus().state).toBe("missing");
  });

  it("leaves the existing missing and download behavior when no bundled directory exists", async () => {
    const transcriber = new TransformersTranscriber(async () => async () => ({ text: "ok" }), undefined);
    await transcriber.preloadBundledModel();
    expect(transcriber.getStatus().state).toBe("missing");
    expect(transcriber.startDownload().state).toBe("downloading");
  });
});
