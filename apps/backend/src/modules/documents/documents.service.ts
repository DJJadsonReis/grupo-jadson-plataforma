import { BadRequestException, Injectable } from "@nestjs/common";
import { lerEntradasZip } from "./office-zip";
import { extrairTextoDocx, extrairTextoXlsx } from "./office-text";

// Biblioteca MIT. Importa o módulo interno para não carregar o trecho de teste do pacote principal.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parsePdf: (data: Buffer) => Promise<{ numpages: number; text: string }> = require("pdf-parse/lib/pdf-parse.js");

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;
export const MAX_OFFICE_BYTES = 5 * 1024 * 1024;

export interface PdfExtraction {
  filename: string;
  pages: number;
  text: string;
  truncated: boolean;
}

@Injectable()
export class DocumentsService {
  /** Extrai texto de anexos Word ou Excel em memória, sem guardar o arquivo. */
  extractOffice(input: { filename?: unknown; contentBase64?: unknown }): PdfExtraction {
    const filename = typeof input.filename === "string" && input.filename.trim() ? input.filename.trim().slice(0, 200) : "documento";
    const extensao = filename.toLowerCase().match(/\.(docx|xlsx)$/)?.[1];
    if (!extensao) throw new BadRequestException({ code: "UNSUPPORTED_DOCUMENT", message: "Envie um arquivo .docx ou .xlsx." });
    if (typeof input.contentBase64 !== "string" || !input.contentBase64) throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "Envie o conteúdo do documento." });
    const buffer = Buffer.from(input.contentBase64, "base64");
    if (buffer.length === 0) throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O arquivo está vazio." });
    if (buffer.length > MAX_OFFICE_BYTES) throw new BadRequestException({ code: "DOCUMENT_TOO_LARGE", message: "O arquivo Office passa de 5 MB." });
    if (buffer.subarray(0, 4).toString("binary") !== "PK\x03\x04") throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O arquivo não é um Office ZIP válido." });
    try {
      const nomes = extensao === "docx" ? ["word/document.xml"] : ["xl/workbook.xml", "xl/sharedStrings.xml"];
      const arquivos = lerEntradasZip(buffer, nomes.concat(extensao === "xlsx" ? Array.from({ length: 500 }, (_, i) => `xl/worksheets/sheet${i + 1}.xml`) : []));
      const documento = arquivos.get(nomes[0]!);
      if (!documento) throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O documento não contém o XML principal esperado." });
      let text: string;
      let pages: number;
      if (extensao === "docx") {
        text = extrairTextoDocx(documento);
        pages = 1;
      } else {
        text = extrairTextoXlsx(arquivos);
        pages = [...arquivos.keys()].filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome)).length;
      }
      if (pages === 0 && extensao === "xlsx") throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "A planilha não contém abas legíveis." });
      return { filename, pages, text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error && error.message === "INVALID_DOCUMENT" ? "O XML do documento é inválido." : "Não foi possível ler este documento Office.";
      throw new BadRequestException({ code: "INVALID_DOCUMENT", message });
    }
  }

  /** Extrai o texto de um PDF enviado em base64. Só lê o conteúdo; não grava o arquivo. */
  async extractPdf(input: { filename?: unknown; contentBase64?: unknown }): Promise<PdfExtraction> {
    const filename = typeof input.filename === "string" && input.filename.trim() ? input.filename.trim().slice(0, 200) : "documento.pdf";
    if (typeof input.contentBase64 !== "string" || !input.contentBase64) {
      throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "Envie o conteúdo do PDF." });
    }
    const buffer = Buffer.from(input.contentBase64, "base64");
    if (buffer.length === 0) throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O arquivo está vazio." });
    if (buffer.length > MAX_PDF_BYTES) throw new BadRequestException({ code: "DOCUMENT_TOO_LARGE", message: "O PDF passa de 5 MB." });
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "O arquivo não é um PDF válido." });
    }

    let parsed: { numpages: number; text: string };
    try {
      parsed = await parsePdf(buffer);
    } catch {
      throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "Não foi possível ler este PDF." });
    }
    const text = parsed.text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return {
      filename,
      pages: parsed.numpages,
      text: text.slice(0, MAX_TEXT_CHARS),
      truncated: text.length > MAX_TEXT_CHARS,
    };
  }
}
