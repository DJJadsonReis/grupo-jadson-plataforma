import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODEL_ID = "onnx-community/whisper-base";
export const MODEL_SIZE_MB = 82;

export type TranscriptionOptions = { language: "portuguese"; task: "transcribe" };
export interface AudioTranscriber { transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> }
export type ModelStatus = { state: "missing" | "downloading" | "ready" | "error"; progress?: number; sizeMb?: number; error?: string };
export interface DictationModel { getStatus(): ModelStatus; startDownload(): ModelStatus; transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> }
export type PipelineOptions = { localModelPath?: string; allowRemoteModels: boolean };

export function modelDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  const root = env.GRUPO_DATA_DIR?.trim() || join(localAppData, "grupo-jadson");
  return join(root, "models");
}

export function bundledModelDirectory(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const directory = env.GJ_DICTATION_BUNDLED_MODEL_DIR?.trim();
  return directory || undefined;
}

export async function verifyBundledModel(directory: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as {
      model?: unknown;
      files?: Array<{ name?: unknown; size?: unknown; sha256?: unknown }>;
    };
    if (manifest.model !== MODEL_ID || !Array.isArray(manifest.files) || manifest.files.length === 0) return false;
    const seen = new Set<string>();
    for (const entry of manifest.files) {
      if (typeof entry.name !== "string" || !entry.name || entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\") || seen.has(entry.name)) return false;
      if (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) return false;
      seen.add(entry.name);
      const bytes = await readFile(join(directory, entry.name));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== entry.size || sha256 !== entry.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class TransformersTranscriber implements DictationModel {
  private pipelinePromise: Promise<any> | null = null;
  private status: ModelStatus = { state: "missing", sizeMb: MODEL_SIZE_MB };
  private readonly pipelineFactory: ((progress: (progress: number) => void, options: PipelineOptions) => Promise<any>) | undefined;

  private readonly bundledDirectory: string | undefined;

  constructor(factory?: (progress: (progress: number) => void, options: PipelineOptions) => Promise<any>, bundledDirectory = bundledModelDirectory()) {
    this.pipelineFactory = factory;
    this.bundledDirectory = bundledDirectory;
  }

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

  async preloadBundledModel(): Promise<void> {
    if (!this.bundledDirectory || this.status.state !== "missing") return;
    this.status = { state: "downloading", progress: 0, sizeMb: MODEL_SIZE_MB };
    if (!(await verifyBundledModel(this.bundledDirectory))) {
      if (this.status.state === "downloading") this.status = { state: "missing", sizeMb: MODEL_SIZE_MB };
      return;
    }
    if (this.status.state !== "downloading") return;
    this.pipelinePromise = this.load(this.bundledDirectory).then((pipeline) => {
      this.status = { state: "ready", progress: 100, sizeMb: MODEL_SIZE_MB };
      return pipeline;
    }).catch((error: unknown) => {
      this.pipelinePromise = null;
      this.status = { state: "error", sizeMb: MODEL_SIZE_MB, error: error instanceof Error ? error.message : "Falha ao carregar o modelo local." };
      return Promise.reject(error);
    });
    void this.pipelinePromise.catch(() => undefined);
    await this.pipelinePromise.catch(() => undefined);
  }

  async transcribe(samples: Float32Array, options: TranscriptionOptions): Promise<string> {
    if (this.status.state !== "ready" || !this.pipelinePromise) throw new Error("MODEL_NOT_READY");
    const pipeline = await this.pipelinePromise;
    const result = await pipeline(samples, { language: options.language, task: options.task });
    return typeof result.text === "string" ? result.text.trim() : "";
  }

  private async load(localModelPath?: string): Promise<any> {
    if (this.pipelineFactory) return this.pipelineFactory((progress) => { this.status = { ...this.status, progress: Math.max(0, Math.min(99, progress)), sizeMb: MODEL_SIZE_MB }; }, { ...(localModelPath ? { localModelPath } : {}), allowRemoteModels: !localModelPath });
    const cacheDir = modelDirectory();
    await mkdir(cacheDir, { recursive: true });
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;
    env.localModelPath = localModelPath ?? cacheDir;
    env.allowRemoteModels = !localModelPath;
    return pipeline("automatic-speech-recognition", MODEL_ID, { dtype: "q8", progress_callback: (item: any) => {
      if (typeof item.progress === "number") this.status = { ...this.status, progress: Math.max(0, Math.min(99, item.progress)), sizeMb: MODEL_SIZE_MB };
    } });
  }
}
