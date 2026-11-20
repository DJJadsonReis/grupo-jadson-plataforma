import type { AudioRecorder } from "./dictation-capture";
import { joinPartialText } from "./dictation-capture";

export type DictationState = "idle" | "checking" | "confirm-download" | "downloading" | "recording" | "stopping" | "sending";
export type ModelStatus = { state: "missing" | "downloading" | "ready" | "error"; progress?: number; sizeMb?: number; error?: string };
export type DictationClient = { status(): Promise<ModelStatus>; download(): Promise<ModelStatus>; transcribe(samples: Float32Array): Promise<string> };
export type DictationEvents = { state: (state: DictationState, status?: ModelStatus) => void; text: (text: string) => void; error: (message: string) => void };

export function dictationErrorMessage(error: unknown, stage: "status" | "download" | "transcription"): string {
  const details = typeof error === "object" && error !== null ? error as { status?: unknown; code?: unknown } : {};
  const status = typeof details.status === "number" ? ` (HTTP ${details.status})` : "";
  if (details.status === 401 || details.code === "UNAUTHORIZED") return `O token local foi recusado. Use “Reconectar” e tente novamente${status}.`;
  if (details.status === 404 || details.code === "MODEL_NOT_FOUND") return "O serviço local de ditado ou o modelo não está instalado.";
  if (details.code === "MODEL_NOT_READY") return "O modelo local de ditado não está disponível. Baixe o modelo e tente novamente.";
  if (details.status === 503 || details.status === 502 || details.status === 0) return `O serviço local de ditado está indisponível${status}. Verifique se o backend está aberto.`;
  if (stage === "download") return `O download do modelo local falhou${status}. Tente novamente.`;
  if (stage === "transcription") return `A transcrição deste trecho falhou${status}. Tente novamente.`;
  return `Não foi possível consultar o serviço local de ditado${status}. Verifique se o backend está aberto.`;
}

export class DictationSession {
  private state: DictationState = "idle";
  private previousText = "";
  private text = "";
  private queue: Promise<void> = Promise.resolve();
  private active = false;
  private generation = 0;
  constructor(private readonly recorder: AudioRecorder, private readonly client: DictationClient, private readonly events: DictationEvents, private readonly localBackend: boolean, private readonly send: (text: string) => void | Promise<void>) {}

  getState(): DictationState { return this.state; }
  getText(): string { return this.text; }

  async begin(previousText: string): Promise<void> {
    if (!this.localBackend) { this.events.error("O ditado precisa do serviço local neste computador."); return; }
    if (this.state !== "idle") return;
    const generation = ++this.generation;
    this.previousText = previousText;
    this.text = previousText;
    this.setState("checking");
    try {
      const status = await this.client.status();
      if (generation !== this.generation) return;
      if (status.state === "missing" || status.state === "error") { this.setState("confirm-download", status); return; }
      if (status.state === "downloading") { await this.waitForDownload(generation); return; }
      await this.startRecording(generation);
    } catch (error) { if (generation === this.generation) this.fail(dictationErrorMessage(error, "status")); }
  }

  async confirmDownload(): Promise<void> {
    if (this.state !== "confirm-download") return;
    const generation = this.generation;
    this.setState("downloading");
    try {
      await this.client.download();
      if (generation === this.generation) await this.waitForDownload(generation);
    } catch (error) { if (generation === this.generation) this.fail(dictationErrorMessage(error, "download")); }
  }

  cancelDownload(): void { if (this.state === "confirm-download") this.setState("idle"); }

  async stop(): Promise<void> { await this.finish(false); }
  async sendText(): Promise<void> { await this.finish(true); }

  async cancel(): Promise<void> {
    if (this.state === "idle" || this.state === "confirm-download") { this.setState("idle"); return; }
    this.generation += 1;
    this.active = false;
    await this.recorder.cancel();
    this.text = this.previousText;
    this.events.text(this.text);
    this.setState("idle");
  }

  private async waitForDownload(generation: number): Promise<void> {
    this.setState("downloading");
    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (generation !== this.generation) return;
      const status = await this.client.status();
      if (generation !== this.generation) return;
      this.events.state("downloading", status);
      if (status.state === "ready") { await this.startRecording(generation); return; }
      if (status.state === "missing") { this.setState("confirm-download", status); return; }
      if (status.state === "error") { this.fail(status.error ? `Falha ao baixar o modelo: ${status.error}` : "Falha ao baixar o modelo local. Tente novamente."); return; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.fail("O download do modelo demorou demais. Verifique a conexão e tente novamente.");
  }

  private async startRecording(generation: number): Promise<void> {
    if (generation !== this.generation) return;
    this.active = true;
    await this.recorder.start((samples) => this.enqueue(samples), (error) => this.fail(error.message));
    if (generation !== this.generation) { this.active = false; await this.recorder.cancel(); return; }
    this.setState("recording");
  }

  private enqueue(samples: Float32Array): void {
    this.queue = this.queue.then(async () => {
      if (!this.active) return;
      try { this.append(await this.client.transcribe(samples)); }
      catch (error) {
        if ((error as { status?: number }).status === 429) {
          try { this.append(await this.client.transcribe(samples)); }
          catch { this.events.error("O serviço está ocupado. O trecho não foi transcrito; tente novamente."); }
        } else this.events.error(dictationErrorMessage(error, "transcription"));
      }
    });
  }

  private append(part: string): void { if (!this.active || !part.trim()) return; this.text = joinPartialText(this.text, part); this.events.text(this.text); }

  private async finish(shouldSend: boolean): Promise<void> {
    if (this.state !== "recording") return;
    const generation = this.generation;
    this.setState(shouldSend ? "sending" : "stopping");
    try {
      await this.recorder.stop();
      await this.queue;
      if (generation !== this.generation) return;
      this.active = false;
      if (shouldSend && this.text.trim()) await this.send(this.text.trim());
      this.setState("idle");
    } catch { this.fail("Não foi possível encerrar o ditado."); }
  }

  private fail(message: string): void { this.generation += 1; this.active = false; void this.recorder.cancel(); this.setState("idle"); this.events.error(message); }
  private setState(state: DictationState, status?: ModelStatus): void { this.state = state; this.events.state(state, status); }
}

export function isLoopbackBackend(apiUrl: string): boolean {
  try { const hostname = new URL(apiUrl).hostname; return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"; }
  catch { return false; }
}
