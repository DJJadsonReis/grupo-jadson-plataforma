import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { DictationService } from "./dictation.service";

@Controller("dictation")
export class DictationController {
  constructor(private readonly service: DictationService) {}
  @Get("status")
  status() { return this.service.status(); }
  @Post("model/download")
  @HttpCode(HttpStatus.ACCEPTED)
  download() { return this.service.download(); }
  @Post("transcribe")
  transcribe(@Body() body: { samples?: unknown }) { return this.service.transcribe(body?.samples); }
}
