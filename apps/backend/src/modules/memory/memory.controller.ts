import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import { MemoryService } from "./memory.service";

@Controller("memory")
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  private owner(request: { principal?: { id: string } }): string { return request.principal?.id ?? "local"; }

  /** Estado da memória e as memórias salvas. */
  @Get()
  async state(@Req() request: { principal?: { id: string } }) {
    const owner = this.owner(request);
    return { enabled: await this.memory.isEnabled(owner), items: await this.memory.list(owner) };
  }

  @Post()
  remember(@Body() body: { content?: unknown }, @Req() request: { principal?: { id: string } }) {
    if (typeof body?.content !== "string") throw new BadRequestException({ code: "INVALID_MEMORY", message: "Envie o texto da memória." });
    return this.memory.remember(body.content, this.owner(request));
  }

  /** Liga ou desliga a memória (opt-out). Desligada, nada é enviado ao modelo. */
  @Put("enabled")
  setEnabled(@Body() body: { enabled?: unknown }, @Req() request: { principal?: { id: string } }) {
    if (typeof body?.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_MEMORY", message: "Informe true ou false." });
    return this.memory.setEnabled(body.enabled, this.owner(request)).then((enabled) => ({ enabled }));
  }

  @Delete(":id")
  async forget(@Param("id") id: string, @Req() request: { principal?: { id: string } }) {
    await this.memory.forget(id, this.owner(request));
    return { deleted: true };
  }
}
