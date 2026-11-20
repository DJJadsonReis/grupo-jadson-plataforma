import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { CheckinsService } from "./checkins.service";
interface PrincipalRequest { principal: Principal }

@Controller("checkins")
export class CheckinsController {
  constructor(private readonly checkins: CheckinsService) {}
  @Get() list(@Req() request: PrincipalRequest, @Query("agentId") agentId?: string) { return this.checkins.list(request.principal.id, agentId); }
  @Post() create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Informe o bot, o foco e o intervalo do check-in.");
    const value = body as Record<string, unknown>;
    if (typeof value.agentId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.agentId)) throw new BadRequestException("Selecione um bot acessível.");
    return this.checkins.create(request.principal, value.agentId, { focus: value.focus, intervalMinutes: value.intervalMinutes });
  }
  @Patch(":id") update(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Informe as alterações do check-in.");
    const value = body as Record<string, unknown>;
    return this.checkins.update(request.principal, id, { focus: value.focus, intervalMinutes: value.intervalMinutes, enabled: value.enabled });
  }
  @Delete(":id") async remove(@Param("id") id: string, @Req() request: PrincipalRequest) { await this.checkins.remove(request.principal, id); return { deleted: true }; }
  @Post(":id/run") run(@Param("id") id: string, @Req() request: PrincipalRequest) { return this.checkins.runNow(request.principal, id); }
  @Get("suggestions") suggestions(@Req() request: PrincipalRequest) { return this.checkins.suggestions(request.principal.id); }
  @Get("suggestions/:id") suggestion(@Param("id") id: string, @Req() request: PrincipalRequest) { return this.checkins.suggestion(request.principal, id); }
  @Post("suggestions/:id/hide") async hide(@Param("id") id: string, @Req() request: PrincipalRequest) { await this.checkins.hide(request.principal, id); return { hidden: true }; }
  @Post("suggestions/:id/start") start(@Param("id") id: string, @Req() request: PrincipalRequest) { return this.checkins.start(request.principal, id); }
}
