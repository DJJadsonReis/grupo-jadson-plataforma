import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { AgentInput, AgentsService } from "./agents.service";

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}
  @Get() list() { return this.agents.list(); }
  @Post() create(@Body() body: unknown) { return this.agents.create(this.parse(body, true) as AgentInput); }
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

  private parse(body: unknown, creating: boolean): Partial<AgentInput> {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Corpo de agente inválido.");
    const value = body as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    if (creating && value.id !== undefined) {
      if (typeof value.id !== "string") throw new BadRequestException("Identificador inválido.");
      this.assertId(value.id); result.id = value.id;
    }
    for (const field of ["name", "description", "instructions", "model", "avatar", "role", "department", "provider"] as const) {
      const fieldValue = value[field];
      if (fieldValue === undefined && !creating) continue;
      const max = field === "instructions" ? 20_000 : field === "avatar" ? 2_000_000 : 300;
      if (fieldValue !== undefined && (typeof fieldValue !== "string" || fieldValue.length > max)) throw new BadRequestException(`Campo ${field} inválido.`);
      result[field] = fieldValue ?? (field === "provider" ? "openai" : "");
    }
    if (result.provider && result.provider !== "openai") throw new BadRequestException("Este backend atualmente oferece somente o provider OpenAI.");
    if (creating && !(result.name as string).trim()) throw new BadRequestException("Nome do agente é obrigatório.");
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new BadRequestException("Campo enabled deve ser booleano.");
    if (creating || value.enabled !== undefined) result.enabled = value.enabled ?? true;
    for (const field of ["specialties", "toolsAllowed"] as const) {
      if (value[field] === undefined && !creating) continue;
      if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].length > 50 || value[field].some((item) => typeof item !== "string" || item.length > 120))) throw new BadRequestException(`Campo ${field} inválido.`);
      result[field] = value[field] ?? [];
    }
    if (value.generationConfig !== undefined || creating) {
      const config = value.generationConfig ?? {};
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new BadRequestException("generationConfig inválido.");
      const typed = config as Record<string, unknown>;
      if (typed.temperature !== undefined && (typeof typed.temperature !== "number" || typed.temperature < 0 || typed.temperature > 2)) throw new BadRequestException("temperature deve estar entre 0 e 2.");
      if (typed.maxTokens !== undefined && (!Number.isInteger(typed.maxTokens) || (typed.maxTokens as number) < 1 || (typed.maxTokens as number) > 32_000)) throw new BadRequestException("maxTokens inválido.");
      result.generationConfig = config;
    }
    return result as Partial<AgentInput>;
  }
  private assertId(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException("Identificador inválido.");
  }
}
