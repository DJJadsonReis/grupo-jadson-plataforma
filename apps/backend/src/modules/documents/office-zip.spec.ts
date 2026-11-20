import { BadRequestException } from "@nestjs/common";
import { lerEntradasZip } from "./office-zip";

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStored(entries: Record<string, string>, reportedSize?: number): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nome = Buffer.from(name); const data = Buffer.from(value); const crc = crc32(data);
    const local = Buffer.alloc(30 + nome.length + data.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nome.length, 26); nome.copy(local, 30); data.copy(local, 30 + nome.length);
    const central = Buffer.alloc(46 + nome.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(reportedSize ?? data.length, 24); central.writeUInt16LE(nome.length, 28); central.writeUInt32LE(offset, 42); nome.copy(central, 46);
    locals.push(local); centrals.push(central); offset += local.length;
  }
  const central = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length, 8); end.writeUInt16LE(centrals.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

describe("lerEntradasZip", () => {
  it("retorna somente as entradas solicitadas", () => {
    const result = lerEntradasZip(zipStored({ "word/document.xml": "ok", extra: "ignorar" }), ["word/document.xml"]);
    expect([...result]).toEqual([["word/document.xml", "ok"]]);
  });
  it("rejeita ZIP inválido e tamanho descomprimido declarado excessivo", () => {
    expect(() => lerEntradasZip(Buffer.from("no zip"), [])).toThrow(BadRequestException);
    const zip = zipStored({ a: "x" }, 10 * 1024 * 1024 + 1);
    expect(() => lerEntradasZip(zip, ["a"])).toThrow(BadRequestException);
  });
});
