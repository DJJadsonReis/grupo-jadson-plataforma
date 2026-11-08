import { BadRequestException, Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { AdminOnly } from "../auth/roles";
import { IntegrationName, IntegrationsService } from "./integrations.service";

/** Chaves de integração: só administradores. Nenhuma rota devolve o valor da chave. */
@AdminOnly()
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  status() {
    return this.integrations.status();
  }

  @Put(":name")
  async save(@Param("name") name: string, @Body() body: { secret?: unknown }) {
    if (typeof body?.secret !== "string") throw new BadRequestException({ code: "INVALID_INTEGRATION", message: "Informe a chave." });
    await this.integrations.save(name as IntegrationName, body.secret);
    return this.integrations.status();
  }

  @Delete(":name")
  async remove(@Param("name") name: string) {
    await this.integrations.remove(name as IntegrationName);
    return this.integrations.status();
  }
}
