export const DICTATION_RATE = 16_000;
export const DICTATION_CHUNK_SAMPLES = DICTATION_RATE * 3;

export function resampleMono(input: Float32Array, sourceRate: number, targetRate = DICTATION_RATE): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || targetRate <= 0) throw new Error("Taxa de amostragem inválida.");
  if (sourceRate === targetRate) return input.slice();
  const outputLength = Math.max(1, Math.floor(input.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < Math.max(start + 1, end); j += 1) sum += input[Math.min(j, input.length - 1)] ?? 0;
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

export function cutAudioChunks(samples: Float32Array, chunkSamples = DICTATION_CHUNK_SAMPLES): Float32Array[] {
  if (!Number.isInteger(chunkSamples) || chunkSamples < 1) throw new Error("Tamanho de trecho inválido.");
  const chunks: Float32Array[] = [];
  for (let offset = 0; offset < samples.length; offset += chunkSamples) chunks.push(samples.slice(offset, offset + chunkSamples));
  return chunks;
}

export function joinPartialText(current: string, next: string): string {
  const left = current.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`.replace(/\s+/g, " ");
}

export type AudioRecorder = { start(onChunk: (samples: Float32Array) => void, onError: (error: Error) => void): Promise<void>; stop(): Promise<Float32Array[]>; cancel(): Promise<void> };

export class MicrophoneRecorder implements AudioRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private pending: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private onChunk: ((samples: Float32Array) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  async start(onChunk: (samples: Float32Array) => void, onError: (error: Error) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este computador não oferece acesso ao microfone.");
    this.onChunk = onChunk;
    this.onError = onError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      this.context = new AudioContext();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0);
        this.pending = appendSamples(this.pending, channel);
        const sourceChunkSamples = Math.round(this.context!.sampleRate * 3);
        while (this.pending.length >= sourceChunkSamples) {
          const sourceChunk = this.pending.slice(0, sourceChunkSamples);
          this.pending = this.pending.slice(sourceChunkSamples);
          const chunk = this.context!.sampleRate === DICTATION_RATE ? sourceChunk : resampleMono(sourceChunk, this.context!.sampleRate);
          this.onChunk?.(chunk);
        }
      };
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.context.destination);
    } catch (error) {
      await this.cleanup();
      const reason = error instanceof Error && error.name === "NotAllowedError" ? new Error("Permita o acesso ao microfone nas configurações do sistema e tente novamente.") : new Error("Não foi possível acessar o microfone neste computador.");
      throw reason;
    }
  }

  async stop(): Promise<Float32Array[]> {
    const sourceRate = this.context?.sampleRate ?? DICTATION_RATE;
    await this.cleanup();
    if (this.pending.length) {
      const tail = sourceRate === DICTATION_RATE ? this.pending : resampleMono(this.pending, sourceRate);
      this.onChunk?.(tail);
      this.pending = new Float32Array(0);
    }
    return [];
  }

  async cancel(): Promise<void> { await this.cleanup(); this.pending = new Float32Array(0); }

  private async cleanup(): Promise<void> {
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect(); this.source?.disconnect(); this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.processor = null; this.source = null; this.sink = null; this.stream = null; this.context = null;
  }
}

function appendSamples(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(left.length + right.length);
  output.set(left); output.set(right, left.length);
  return output;
}
