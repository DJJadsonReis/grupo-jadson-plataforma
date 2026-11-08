import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { RoutinesService } from "./routines.service";

@Controller("routines")
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list() {
    return this.routines.list();
  }

  @Post()
  create(@Body() body: { name?: unknown; tool?: unknown; intervalMinutes?: unknown }) {
    if (typeof body?.name !== "string" || typeof body?.tool !== "string" || typeof body?.intervalMinutes !== "number") {
      throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe nome, ferramenta e intervalo em minutos." });
    }
    return this.routines.create({ name: body.name, tool: body.tool, intervalMinutes: body.intervalMinutes });
  }

  @Put(":id/enabled")
  setEnabled(@Param("id") id: string, @Body() body: { enabled?: unknown }) {
    if (typeof body?.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe true ou false." });
    return this.routines.setEnabled(id, body.enabled);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.routines.remove(id);
    return { deleted: true };
  }
}
