import { BadRequestException } from "@nestjs/common";
import { inflateRawSync } from "node:zlib";

const MAX_ENTRIES = 500;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function invalid(): never {
  throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O arquivo Office é inválido ou não é compatível." });
}

/** Lê, sem acessar o disco, somente entradas nomeadas de um arquivo ZIP. */
export function lerEntradasZip(buffer: Buffer, nomesDesejados: string[]): Map<string, string> {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString("binary") !== "PK\x03\x04") invalid();
  const fimMin = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= fimMin; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0 || eocd + 22 > buffer.length) invalid();
  const disco = buffer.readUInt16LE(eocd + 4);
  const discoCentral = buffer.readUInt16LE(eocd + 6);
  const entradasDisco = buffer.readUInt16LE(eocd + 8);
  const quantidade = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (disco !== 0 || discoCentral !== 0 || entradasDisco !== quantidade || quantidade > MAX_ENTRIES || eocd + 22 + commentLength > buffer.length || centralOffset + centralSize > eocd) invalid();

  const desejados = new Set(nomesDesejados);
  const encontrados = new Map<string, string>();
  let offset = centralOffset;
  let totalDescomprimido = 0;
  for (let i = 0; i < quantidade; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) invalid();
    const flags = buffer.readUInt16LE(offset + 8);
    const metodo = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const comprimido = buffer.readUInt32LE(offset + 20);
    const descomprimido = buffer.readUInt32LE(offset + 24);
    const nomeLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const comentarioLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const fimEntrada = offset + 46 + nomeLength + extraLength + comentarioLength;
    if (fimEntrada > buffer.length) invalid();
    const nome = buffer.subarray(offset + 46, offset + 46 + nomeLength).toString("utf8");
    if (nome.startsWith("/") || nome.includes("\\") || nome.split("/").includes("..") || /^[A-Za-z]:/.test(nome)) invalid();
    if (flags & 1 || (metodo !== 0 && metodo !== 8)) invalid();
    if (descomprimido > MAX_ENTRY_BYTES) throw new BadRequestException({ code: "DOCUMENT_TOO_LARGE", message: "Uma entrada do documento passa de 10 MB." });
    totalDescomprimido += descomprimido;
    if (totalDescomprimido > MAX_TOTAL_BYTES) throw new BadRequestException({ code: "DOCUMENT_TOO_LARGE", message: "O conteúdo descomprimido passa de 20 MB." });
    if (desejados.has(nome)) {
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) invalid();
      const localNomeLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dadosOffset = localOffset + 30 + localNomeLength + localExtraLength;
      if (dadosOffset + comprimido > buffer.length) invalid();
      const dados = buffer.subarray(dadosOffset, dadosOffset + comprimido);
      let texto: Buffer;
      try { texto = metodo === 0 ? Buffer.from(dados) : inflateRawSync(dados, { maxOutputLength: MAX_ENTRY_BYTES }); } catch { invalid(); }
      if (texto.length !== descomprimido || texto.length > MAX_ENTRY_BYTES || crc32(texto) !== crc) invalid();
      encontrados.set(nome, texto.toString("utf8"));
    }
    offset = fimEntrada;
  }
  if (offset !== centralOffset + centralSize) invalid();
  return encontrados;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
