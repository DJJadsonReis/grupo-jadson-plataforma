import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import { RoutinesService } from "./routines.service";

@Controller("routines")
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list(@Req() request: { principal?: { id: string } }) {
    return this.routines.list(request.principal?.id ?? "sistema");
  }

  @Post()
  create(@Body() body: { name?: unknown; tool?: unknown; intervalMinutes?: unknown; dailyAt?: unknown }, @Req() request: { principal?: { id: string } }) {
    const intervalMode = typeof body?.intervalMinutes === "number" && body?.dailyAt === undefined;
    const dailyMode = typeof body?.dailyAt === "string" && body?.intervalMinutes === undefined && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(body.dailyAt);
    if (typeof body?.name !== "string" || typeof body?.tool !== "string" || (!intervalMode && !dailyMode)) {
      throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe nome, ferramenta e apenas um agendamento: intervalo ou horário diário." });
    }
    return this.routines.create({ name: body.name, tool: body.tool, ...(intervalMode ? { intervalMinutes: body.intervalMinutes as number } : { dailyAt: body.dailyAt as string }), owner: request.principal?.id ?? "sistema" });
  }

  @Put(":id/enabled")
  setEnabled(@Param("id") id: string, @Body() body: { enabled?: unknown }, @Req() request: { principal?: { id: string } }) {
    if (typeof body?.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe true ou false." });
    return this.routines.setEnabled(id, body.enabled, request.principal?.id ?? "sistema");
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() request: { principal?: { id: string } }) {
    await this.routines.remove(id, request.principal?.id ?? "sistema");
    return { deleted: true };
  }
}
