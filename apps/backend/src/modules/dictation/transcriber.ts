import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODEL_ID = "onnx-community/whisper-base";
export const MODEL_SIZE_MB = 82;

export type TranscriptionOptions = { language: "portuguese"; task: "transcribe" };
export interface AudioTranscriber { transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> }
export type ModelStatus = { state: "missing" | "downloading" | "ready" | "error"; progress?: number; sizeMb?: number; error?: string };
export interface DictationModel { getStatus(): ModelStatus; startDownload(): ModelStatus; transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> }

export function modelDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  const root = env.GRUPO_DATA_DIR?.trim() || join(localAppData, "grupo-jadson");
  return join(root, "models");
}

export class TransformersTranscriber implements DictationModel {
  private pipelinePromise: Promise<any> | null = null;
  private status: ModelStatus = { state: "missing", sizeMb: MODEL_SIZE_MB };
  private readonly pipelineFactory: ((progress: (progress: number) => void) => Promise<any>) | undefined;

  constructor(factory?: (progress: (progress: number) => void) => Promise<any>) { this.pipelineFactory = factory; }

  getStatus(): ModelStatus { return { ...this.status }; }

  startDownload(): ModelStatus {
    if (this.status.state === "ready" || this.status.state === "downloading") return this.getStatus();
    this.status = { state: "downloading", progress: 0, sizeMb: MODEL_SIZE_MB };
    this.pipelinePromise = this.load().then((pipeline) => {
      this.status = { state: "ready", progress: 100, sizeMb: MODEL_SIZE_MB };
      return pipeline;
    }).catch((error: unknown) => {
      this.pipelinePromise = null;
      this.status = { state: "error", sizeMb: MODEL_SIZE_MB, error: error instanceof Error ? error.message : "Falha ao baixar o modelo local." };
      return Promise.reject(error);
    });
    void this.pipelinePromise.catch(() => undefined);
    return this.getStatus();
  }

  async transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> {
    if (this.status.state !== "ready" || !this.pipelinePromise) throw new Error("MODEL_NOT_READY");
    const pipeline = await this.pipelinePromise;
    const result = await pipeline(samples, { language: options.language, task: options.task });
    return typeof result.text === "string" ? result.text.trim() : "";
  }

  private async load(): Promise<any> {
    if (this.pipelineFactory) return this.pipelineFactory((progress) => { this.status = { ...this.status, progress: Math.max(0, Math.min(99, progress)), sizeMb: MODEL_SIZE_MB }; });
    const cacheDir = modelDirectory();
    await mkdir(cacheDir, { recursive: true });
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;
    return pipeline("automatic-speech-recognition", MODEL_ID, { dtype: "q8", progress_callback: (item: any) => {
      if (typeof item.progress === "number") this.status = { ...this.status, progress: Math.max(0, Math.min(99, item.progress)), sizeMb: MODEL_SIZE_MB };
    } });
  }
}
