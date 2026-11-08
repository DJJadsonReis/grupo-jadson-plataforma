import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { MemoryService } from "./memory.service";

@Controller("memory")
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  /** Estado da memória e as memórias salvas. */
  @Get()
  async state() {
    return { enabled: await this.memory.isEnabled(), items: await this.memory.list() };
  }

  @Post()
  remember(@Body() body: { content?: unknown }) {
    if (typeof body?.content !== "string") throw new BadRequestException({ code: "INVALID_MEMORY", message: "Envie o texto da memória." });
    return this.memory.remember(body.content);
  }

  /** Liga ou desliga a memória (opt-out). Desligada, nada é enviado ao modelo. */
  @Put("enabled")
  setEnabled(@Body() body: { enabled?: unknown }) {
    if (typeof body?.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_MEMORY", message: "Informe true ou false." });
    return this.memory.setEnabled(body.enabled).then((enabled) => ({ enabled }));
  }

  @Delete(":id")
  async forget(@Param("id") id: string) {
    await this.memory.forget(id);
    return { deleted: true };
  }
}
