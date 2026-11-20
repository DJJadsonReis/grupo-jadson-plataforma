import { describe, expect, it, vi } from "vitest";
import { DictationSession, dictationErrorMessage, isLoopbackBackend, type ModelStatus } from "./dictation-session";
import type { AudioRecorder } from "./dictation-capture";

function setup(initial = "") {
  let emit!: (samples: Float32Array) => void;
  const recorder: AudioRecorder = { start: vi.fn(async (onChunk) => { emit = onChunk; }), stop: vi.fn(async () => []), cancel: vi.fn(async () => {}) };
  const client = { status: vi.fn(async (): Promise<ModelStatus> => ({ state: "ready", sizeMb: 82 })), download: vi.fn(async (): Promise<ModelStatus> => ({ state: "downloading", progress: 0, sizeMb: 82 })), transcribe: vi.fn(async (samples: Float32Array) => `parte ${samples[0]}`) };
  const events = { state: vi.fn(), text: vi.fn(), error: vi.fn() };
  const send = vi.fn();
  const session = new DictationSession(recorder, client, events, true, send);
  return { session, recorder, client, events, send, emit: (value: number) => emit(new Float32Array([value])), initial };
}

describe("DictationSession", () => {
  it("começa a capturar diretamente quando o modelo embutido já está pronto", async () => {
    const ctx = setup();
    await ctx.session.begin("");
    expect(ctx.session.getState()).toBe("recording");
    expect(ctx.client.download).not.toHaveBeenCalled();
    expect(ctx.events.state).not.toHaveBeenCalledWith("confirm-download", expect.anything());
  });

  it("explica a causa do erro e inclui o status HTTP quando disponível", () => {
    expect(dictationErrorMessage(Object.assign(new Error(), { status: 401, code: "UNAUTHORIZED" }), "status")).toContain("HTTP 401");
    expect(dictationErrorMessage(Object.assign(new Error(), { status: 404 }), "download")).toContain("não está instalado");
    expect(dictationErrorMessage(Object.assign(new Error(), { status: 503 }), "status")).toContain("HTTP 503");
    expect(dictationErrorMessage(new Error(), "transcription")).toContain("transcrição deste trecho falhou");
  });

  it("não esconde a recusa de token atrás da mensagem genérica", async () => {
    const ctx = setup();
    ctx.client.status.mockRejectedValue(Object.assign(new Error(), { status: 401, code: "UNAUTHORIZED" }));
    await ctx.session.begin("");
    expect(ctx.events.error).toHaveBeenCalledWith(expect.stringContaining("token local foi recusado"));
    expect(ctx.events.error).not.toHaveBeenCalledWith("Não foi possível falar com o serviço local de ditado.");
  });
  it("exibe cada transcrição enquanto recebe os trechos", async () => {
    const ctx = setup(); await ctx.session.begin(""); ctx.emit(1); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(1)); ctx.emit(2); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(2)); ctx.emit(3); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(3));
    expect(ctx.events.text.mock.calls.map(([text]) => text)).toEqual(["parte 1", "parte 1 parte 2", "parte 1 parte 2 parte 3"]);
  });
  it("Parar preserva o texto e não envia", async () => {
    const ctx = setup(); await ctx.session.begin(""); ctx.emit(1); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(1)); await ctx.session.stop();
    expect(ctx.events.text).toHaveBeenLastCalledWith("parte 1"); expect(ctx.send).not.toHaveBeenCalled();
  });
  it("Enviar envia o texto inteiro exatamente uma vez", async () => {
    const ctx = setup(); await ctx.session.begin(""); ctx.emit(1); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(1)); ctx.emit(2); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(2)); await ctx.session.sendText();
    expect(ctx.send).toHaveBeenCalledTimes(1); expect(ctx.send).toHaveBeenCalledWith("parte 1 parte 2");
  });
  it("Cancelar restaura o texto anterior e não envia", async () => {
    const ctx = setup(); await ctx.session.begin("texto anterior"); ctx.emit(1); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledTimes(1)); await ctx.session.cancel();
    expect(ctx.events.text).toHaveBeenLastCalledWith("texto anterior"); expect(ctx.send).not.toHaveBeenCalled();
  });
  it("solicita confirmação com o tamanho do modelo antes do download", async () => {
    const ctx = setup(); ctx.client.status.mockResolvedValue({ state: "missing", sizeMb: 82 }); await ctx.session.begin("");
    expect(ctx.session.getState()).toBe("confirm-download"); expect(ctx.events.state).toHaveBeenLastCalledWith("confirm-download", { state: "missing", sizeMb: 82 });
    ctx.session.cancelDownload(); expect(ctx.client.download).not.toHaveBeenCalled();
  });
  it("solicita confirmação quando a verificação inicial termina sem modelo válido", async () => {
    const ctx = setup();
    ctx.client.status.mockResolvedValueOnce({ state: "downloading", progress: 0, sizeMb: 82 }).mockResolvedValueOnce({ state: "missing", sizeMb: 82 });
    await ctx.session.begin("");
    await vi.waitFor(() => expect(ctx.session.getState()).toBe("confirm-download"));
    expect(ctx.client.download).not.toHaveBeenCalled();
  });
  it("tenta mais uma vez quando o serviço responde ocupado", async () => {
    const ctx = setup();
    ctx.client.transcribe.mockRejectedValueOnce(Object.assign(new Error("ocupado"), { status: 429 })).mockResolvedValueOnce("trecho recuperado");
    await ctx.session.begin(""); ctx.emit(1); await vi.waitFor(() => expect(ctx.events.text).toHaveBeenCalledWith("trecho recuperado"));
    expect(ctx.client.transcribe).toHaveBeenCalledTimes(2);
  });
  it("mostra a mensagem exata se o backend não é local", async () => {
    const ctx = setup();
    const session = new DictationSession(ctx.recorder, ctx.client, ctx.events, false, ctx.send);
    await session.begin("");
    expect(ctx.events.error).toHaveBeenCalledWith("O ditado precisa do serviço local neste computador.");
    expect(ctx.client.status).not.toHaveBeenCalled();
  });
  it("desativa o ditado para serviço que não está em loopback", () => {
    expect(isLoopbackBackend("https://backend.exemplo/api/v1")).toBe(false);
    expect(isLoopbackBackend("http://localhost:3333/api/v1")).toBe(true);
  });
});
