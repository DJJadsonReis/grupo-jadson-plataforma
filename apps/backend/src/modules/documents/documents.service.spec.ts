import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { DocumentsService, MAX_PDF_BYTES } from "./documents.service";

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
