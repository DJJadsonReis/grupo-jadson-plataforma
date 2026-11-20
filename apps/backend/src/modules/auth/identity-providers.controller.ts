import { Controller, Get, UseGuards } from "@nestjs/common";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";
import { AdminOnly } from "./roles";
import { identityProviderStatus } from "./identity-providers.service";

@AdminOnly()
@UseGuards(PersonalEditionGuard)
@TeamOnly()
@Controller("identity-providers")
export class IdentityProvidersController {
  @Get()
  list() {
    return identityProviderStatus();
  }
}
