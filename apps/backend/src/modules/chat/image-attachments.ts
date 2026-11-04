import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export interface ValidatedImage { id: string; name: string; type: string; size: number; dataUrl: string; }

export function validateImageAttachment(value: unknown): ValidatedImage {
  if (!value || typeof value !== "object") throw new BadRequestException("Anexo inválido.");
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || item.name.length > 240 || typeof item.type !== "string" || !TYPES.has(item.type) || typeof item.dataUrl !== "string") throw new BadRequestException("Formato inválido. Aceitos: PNG, JPEG e WebP.");
  const prefix = `data:${item.type};base64,`;
  if (!item.dataUrl.startsWith(prefix)) throw new BadRequestException("Conteúdo de imagem inválido.");
  const encoded = item.dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new BadRequestException("Codificação da imagem inválida.");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || (typeof item.size === "number" && item.size !== bytes.length)) throw new BadRequestException("Imagem inválida ou acima de 5 MB.");
  const signatureValid = item.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : item.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!signatureValid) throw new BadRequestException("O conteúdo não corresponde ao formato de imagem declarado.");
  return { id: typeof item.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) ? item.id : randomUUID(), name: item.name, type: item.type, size: bytes.length, dataUrl: item.dataUrl };
}
