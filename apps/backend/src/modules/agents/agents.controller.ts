import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get() list() { return this.agents.list(); }
  @Post() async create(@Body() body: unknown) { return this.agents.create(this.parse(body, true)); }
  @Patch(":id") async update(@Param("id") id: string, @Body() body: unknown) {
    this.assertId(id);
    const result = await this.agents.update(id, this.parse(body, false));
    if (!result) throw new NotFoundException("Agente não encontrado.");
    return result;
  }
  @Delete(":id") async remove(@Param("id") id: string) {
    this.assertId(id);
    if (!await this.agents.remove(id)) throw new NotFoundException("Agente não encontrado.");
    return { deleted: true };
  }

  private parse(body: unknown, creating: true): { id?: string; name: string; description: string; instructions: string; model: string; enabled: boolean };
  private parse(body: unknown, creating: false): { name?: string; description?: string; instructions?: string; model?: string; enabled?: boolean };
  private parse(body: unknown, creating: boolean) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Corpo de agente inválido.");
    const value = body as Record<string, unknown>;
    if (creating && value.id !== undefined) {
      if (typeof value.id !== "string") throw new BadRequestException("Identificador inválido.");
      this.assertId(value.id);
    }
    const fields = ["name", "description", "instructions", "model"] as const;
    const result: Record<string, string | boolean> = {};
    if (creating && typeof value.id === "string") result.id = value.id;
    for (const field of fields) {
      const fieldValue = value[field];
      if (fieldValue === undefined && !creating) continue;
      if (fieldValue !== undefined && (typeof fieldValue !== "string" || fieldValue.length > (field === "instructions" ? 20_000 : 300))) throw new BadRequestException(`Campo ${field} inválido.`);
      result[field] = (fieldValue as string | undefined) ?? "";
    }
    if (creating && !(result.name as string).trim()) throw new BadRequestException("Nome do agente é obrigatório.");
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new BadRequestException("Campo enabled deve ser booleano.");
    if (creating || value.enabled !== undefined) result.enabled = (value.enabled as boolean | undefined) ?? true;
    return result as never;
  }

  private assertId(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException("Identificador inválido.");
  }
}
