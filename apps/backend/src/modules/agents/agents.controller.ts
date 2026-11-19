import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { AgentInput, AgentsService } from "./agents.service";
import { AgentPermissionsService, ShareRole } from "./agent-permissions.service";
import { Principal } from "../auth/users.service";

interface PrincipalRequest { principal?: Principal }

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService, private readonly permissions: AgentPermissionsService) {}
  @Get() async list(@Req() request: PrincipalRequest) {
    const principal = this.principal(request);
    const accesses = await this.permissions.listAccessible(principal);
    const accessById = new Map(accesses.map((item) => [item.id, item.access]));
    const records = (await this.agents.list()).filter((agent) => accessById.has(agent.id));
    return records.map((agent) => {
      const access = accessById.get(agent.id)!;
      return access === "user"
        ? { ...agent, instructions: "", toolsAllowed: [], generationConfig: {}, permission: access }
        : { ...agent, permission: access };
    });
  }
  @Post() create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    return this.agents.create(this.parse(body, true) as AgentInput, this.principal(request).id);
  }
  @Patch(":id") async update(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    this.assertId(id);
    await this.permissions.assertCanEdit(id, this.principal(request));
    const result = await this.agents.update(id, this.parse(body, false));
    if (!result) throw new NotFoundException("Agente não encontrado.");
    return result;
  }
  @Delete(":id") async remove(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertId(id);
    await this.permissions.assertCanDelete(id, this.principal(request));
    if (!await this.agents.remove(id)) throw new NotFoundException("Agente não encontrado.");
    return { deleted: true };
  }

  @Get(":id/shares") listShares(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertId(id);
    return this.permissions.listShares(id, this.principal(request));
  }

  @Put(":id/shares") async grant(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    this.assertId(id);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Compartilhamento inválido.");
    const value = body as Record<string, unknown>;
    const userId = value.userId, teamId = value.teamId, role = value.role;
    if (Boolean(userId) === Boolean(teamId) || (userId !== undefined && (typeof userId !== "string" || !this.isUuid(userId))) || (teamId !== undefined && (typeof teamId !== "string" || !this.isUuid(teamId)))) {
      throw new BadRequestException("Informe um UUID de pessoa ou de time.");
    }
    if (role !== "editor" && role !== "user") throw new BadRequestException("Papel deve ser editor ou user.");
    await this.permissions.grant(id, { ...(typeof userId === "string" ? { userId } : {}), ...(typeof teamId === "string" ? { teamId } : {}) }, role as ShareRole, this.principal(request));
    return { saved: true };
  }

  @Delete(":id/shares/:kind/:targetId") async revoke(@Param("id") id: string, @Param("kind") kind: string, @Param("targetId") targetId: string, @Req() request: PrincipalRequest) {
    this.assertId(id); this.assertId(targetId);
    if (kind !== "people" && kind !== "teams") throw new BadRequestException("Destino de compartilhamento inválido.");
    await this.permissions.revoke(id, kind === "people" ? { userId: targetId } : { teamId: targetId }, this.principal(request));
    return { revoked: true };
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
    if (!this.isUuid(id)) throw new BadRequestException("Identificador inválido.");
  }
  private isUuid(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
  private principal(request: PrincipalRequest): Principal {
    return request.principal ?? { id: "sistema", name: "Administrador", role: "admin" };
  }
}
