import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { DocumentsService, MAX_PDF_BYTES, MAX_TEXT_CHARS } from "./documents.service";
import { zipStored } from "./office-zip.spec";

const samplePath = join(__dirname, "..", "..", "..", "node_modules", "pdf-parse", "test", "data", "01-valid.pdf");

describe("DocumentsService.extractPdf", () => {
  const service = new DocumentsService();

  it("lê o texto de um PDF válido", async () => {
    const base64 = readFileSync(samplePath).toString("base64");
    const result = await service.extractPdf({ filename: "exemplo.pdf", contentBase64: base64 });
    expect(result.filename).toBe("exemplo.pdf");
    expect(result.pages).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("recusa arquivo que não começa com %PDF-", async () => {
    const base64 = Buffer.from("texto qualquer").toString("base64");
    await expect(service.extractPdf({ contentBase64: base64 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa conteúdo vazio ou acima do limite de tamanho", async () => {
    await expect(service.extractPdf({ contentBase64: "" })).rejects.toBeInstanceOf(BadRequestException);
    const big = Buffer.alloc(MAX_PDF_BYTES + 1, 0x41).toString("base64");
    await expect(service.extractPdf({ contentBase64: big })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DocumentsService.extractOffice", () => {
  const service = new DocumentsService();
  const b64 = (entries: Record<string, string>) => zipStored(entries).toString("base64");
  it("lê DOCX/XLSX e retorna a forma esperada", () => {
    const docx = service.extractOffice({ filename: "Arquivo.DOCX", contentBase64: b64({ "word/document.xml": "<w:document><w:p><w:r><w:t>Oi &amp; olá</w:t></w:r></w:p><w:p><w:r><w:t>Fim</w:t></w:r></w:p></w:document>" }) });
    expect(docx).toEqual({ filename: "Arquivo.DOCX", pages: 1, text: "Oi & olá\nFim", truncated: false });
    const xlsx = service.extractOffice({ filename: "dados.xlsx", contentBase64: b64({
      "xl/workbook.xml": '<workbook><sheets><sheet name="A"/><sheet name="B"/></sheets></workbook>',
      "xl/sharedStrings.xml": "<sst><si><t>Compartilhado</t></si></sst>",
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>123</v></c></row></sheetData></worksheet>',
      "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row><c t="inlineStr"><is><t>Inline</t></is></c></row></sheetData></worksheet>',
    }) });
    expect(xlsx.filename).toBe("dados.xlsx"); expect(xlsx.pages).toBe(2); expect(xlsx.text).toContain("Compartilhado\t123"); expect(xlsx.text).toContain("Inline"); expect(xlsx.truncated).toBe(false);
  });
  it("recusa extensão incompatível, não ZIP e XML principal ausente", () => {
    expect(() => service.extractOffice({ filename: "a.pdf", contentBase64: "eA==" })).toThrow(BadRequestException);
    expect(() => service.extractOffice({ filename: "a.docx", contentBase64: Buffer.from("no").toString("base64") })).toThrow(BadRequestException);
    expect(() => service.extractOffice({ filename: "a.docx", contentBase64: b64({ other: "x" }) })).toThrow(BadRequestException);
  });
  it("recusa DTD e marca texto truncado", () => {
    expect(() => service.extractOffice({ filename: "a.docx", contentBase64: b64({ "word/document.xml": '<!DOCTYPE a><w:p><w:r><w:t>x</w:t></w:r></w:p>' }) })).toThrow(BadRequestException);
    const long = "a".repeat(MAX_TEXT_CHARS + 1);
    const result = service.extractOffice({ filename: "a.docx", contentBase64: b64({ "word/document.xml": `<w:document><w:p><w:r><w:t>${long}</w:t></w:r></w:p></w:document>` }) });
    expect(result.text).toHaveLength(MAX_TEXT_CHARS); expect(result.truncated).toBe(true);
  });
});
