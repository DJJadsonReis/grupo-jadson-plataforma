import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { parseEdition } from "../../common/edition";

@Controller("edition")
export class EditionController {
  @Public()
  @Get()
  getEdition() {
    return { edition: parseEdition(process.env.GRUPO_EDICAO) };
  }
}
