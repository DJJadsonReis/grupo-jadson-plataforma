import { BadRequestException } from "@nestjs/common";

export const MAX_SAMPLES = 480_000;

export function decodeAudioSamples(encoded: unknown): Float32Array {
  if (typeof encoded !== "string" || !encoded || encoded.length > Math.ceil(MAX_SAMPLES * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new BadRequestException({ code: "INVALID_AUDIO", message: "O áudio enviado é inválido." });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length % 4 !== 0 || bytes.length === 0 || bytes.length / 4 > MAX_SAMPLES) {
    throw new BadRequestException({ code: "INVALID_AUDIO", message: "O áudio precisa ter amostras válidas de até 30 segundos." });
  }
  const samples = new Float32Array(bytes.length / 4);
  for (let i = 0; i < samples.length; i += 1) {
    const value = bytes.readFloatLE(i * 4);
    if (!Number.isFinite(value)) throw new BadRequestException({ code: "INVALID_AUDIO", message: "O áudio contém valores inválidos." });
    samples[i] = value;
  }
  return samples;
}
