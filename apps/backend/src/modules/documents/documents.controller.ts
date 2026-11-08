import { Body, Controller, Post } from "@nestjs/common";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Lê o texto de um PDF enviado pelo desktop. O arquivo não é guardado. */
  @Post("pdf")
  extractPdf(@Body() body: { filename?: unknown; contentBase64?: unknown }) {
    return this.documents.extractPdf(body ?? {});
  }
}
