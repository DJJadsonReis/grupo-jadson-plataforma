import { Controller, Get, UseGuards } from "@nestjs/common";
import { PersonalEditionGuard } from "../../common/personal-edition.guard";
import { ProvidersService } from "./providers.service";

@Controller("providers")
@UseGuards(PersonalEditionGuard)
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get("catalogue")
  catalogue() { return this.providers.catalogue(); }
}
