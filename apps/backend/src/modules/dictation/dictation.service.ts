import { ConflictException, HttpException, Injectable } from "@nestjs/common";
import { decodeAudioSamples } from "./audio-validation";
import { MODEL_SIZE_MB, TransformersTranscriber, type DictationModel } from "./transcriber";

@Injectable()
export class DictationService {
  private busy = false;
  constructor(private readonly transcriber: DictationModel = new TransformersTranscriber()) {
    if (transcriber instanceof TransformersTranscriber) void transcriber.preloadBundledModel();
  }

  status() { return { ...this.transcriber.getStatus(), ...(this.transcriber.getStatus().state === "missing" ? { sizeMb: MODEL_SIZE_MB } : {}) }; }
  download() { return this.transcriber.startDownload(); }

  async transcribe(encoded: unknown): Promise<{ text: string }> {
    const samples = decodeAudioSamples(encoded);
    if (this.transcriber.getStatus().state !== "ready") throw new ConflictException({ code: "MODEL_NOT_READY", message: "O modelo local ainda não está pronto." });
    if (this.busy) throw new HttpException({ code: "BUSY", message: "Outra transcrição está em andamento. Tente este trecho novamente." }, 429);
    this.busy = true;
    try { return { text: await this.transcriber.transcribe(samples, { language: "portuguese", task: "transcribe" }) }; }
    catch (error) {
      if (error instanceof Error && error.message === "MODEL_NOT_READY") throw new ConflictException({ code: "MODEL_NOT_READY", message: "O modelo local ainda não está pronto." });
      throw error;
    } finally { this.busy = false; }
  }
}
