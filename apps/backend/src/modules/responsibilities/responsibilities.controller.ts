import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { ResponsibilitiesService } from "./responsibilities.service";

interface PrincipalRequest { principal: Principal }

@Controller("responsibilities")
export class ResponsibilitiesController {
  constructor(private readonly responsibilities: ResponsibilitiesService) {}

  @Get() list(@Req() request: PrincipalRequest) { return this.responsibilities.list(request.principal.id); }

  @Post() create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "Informe nome, instrução, bot e intervalo." });
    }
    const value = body as Record<string, unknown>;
    return this.responsibilities.create(request.principal.id, {
      name: value.name, instructions: value.instructions, agentId: value.agentId, intervalMinutes: value.intervalMinutes,
    });
  }

  @Put(":id/enabled") setEnabled(@Param("id") id: string, @Body() body: { enabled?: unknown }, @Req() request: PrincipalRequest) {
    if (typeof body?.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "Informe true ou false." });
    return this.responsibilities.setEnabled(request.principal.id, id, body.enabled);
  }

  @Delete(":id") async remove(@Param("id") id: string, @Req() request: PrincipalRequest) {
    await this.responsibilities.remove(request.principal.id, id);
    return { deleted: true };
  }
}
