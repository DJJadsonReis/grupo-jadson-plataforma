import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Optional, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { AgentInput, AgentsService } from "./agents.service";
import { AgentPermissionsService, ShareRole } from "./agent-permissions.service";
import { Principal } from "../auth/users.service";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";
import { validateAgentEndpoint } from "./agent-endpoint";
import { ModelProvidersService } from "../providers/model-providers.service";
import { isOperationMode } from "../tools/operation-modes";

interface PrincipalRequest { principal?: Principal }

@Controller("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService, private readonly permissions: AgentPermissionsService, @Optional() private readonly modelProviders?: ModelProvidersService) {}
  @Get() async list(@Req() request: PrincipalRequest) {
    const principal = this.principal(request);
    const accesses = await this.permissions.listAccessible(principal);
    const accessById = new Map(accesses.map((item) => [item.id, item.access]));
    const records = (await this.agents.list()).filter((agent) => accessById.has(agent.id));
    return records.map((agent) => {
      const access = accessById.get(agent.id)!;
      return access === "user"
        ? { ...agent, instructions: "", toolsAllowed: [], generationConfig: {}, endpointUrl: null, hasEndpointToken: false, permission: access }
        : { ...agent, permission: access };
    });
  }
  @Post() async create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    const input = this.parse(body, true) as AgentInput;
    await this.validateRouting(input);
    const agent = await this.agents.create(input, this.principal(request).id);
    return { ...agent, permission: "owner" as const };
  }
  @Patch(":id") async update(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    this.assertId(id);
    await this.permissions.assertCanEdit(id, this.principal(request));
    const input = this.parse(body, false);
    await this.validateRouting(input);
    const result = await this.agents.update(id, input);
    if (!result) throw new NotFoundException("Agente não encontrado.");
    return { ...result, permission: await this.permissions.access(id, this.principal(request)) };
  }
  @Delete(":id") async remove(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertId(id);
    await this.permissions.assertCanDelete(id, this.principal(request));
    if (!await this.agents.remove(id)) throw new NotFoundException("Agente não encontrado.");
    return { deleted: true };
  }

  @UseGuards(PersonalEditionGuard)
  @TeamOnly()
  @Get(":id/shares") listShares(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertId(id);
    return this.permissions.listShares(id, this.principal(request));
  }

  @UseGuards(PersonalEditionGuard)
  @TeamOnly()
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

  @UseGuards(PersonalEditionGuard)
  @TeamOnly()
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
    if (value.providerKind !== undefined || creating) {
      if (value.providerKind !== undefined && value.providerKind !== "model" && value.providerKind !== "endpoint") throw new BadRequestException("Tipo de agente inválido.");
      result.providerKind = value.providerKind ?? "model";
    }
    if (value.endpointProtocol !== undefined || creating) {
      const protocol = value.endpointProtocol ?? "json";
      if (protocol !== "json" && protocol !== "agui") throw new BadRequestException("Protocolo do endpoint deve ser json ou agui.");
      result.endpointProtocol = protocol;
    }
    if (value.providerKind === "endpoint" || (!creating && value.endpointUrl !== undefined)) {
      result.endpointUrl = validateAgentEndpoint(value.endpointUrl);
    } else if (!creating && value.providerKind === "model") {
      result.endpointUrl = null;
      result.endpointToken = "";
    } else if (value.endpointUrl !== undefined) throw new BadRequestException("URL de endpoint só pode ser usada por agente endpoint.");
    if (value.endpointToken !== undefined) {
      if (typeof value.endpointToken !== "string" || value.endpointToken.length > 2000) throw new BadRequestException("Token do endpoint inválido.");
      result.endpointToken = value.endpointToken;
    }
    if (result.provider && !["openai", "anthropic"].includes(String(result.provider)) && !this.isUuid(String(result.provider))) throw new BadRequestException("Selecione um provedor cadastrado.");
    if (value.modelRouting !== undefined || creating) result.modelRouting = this.parseModelRouting(value.modelRouting ?? {});
    if (value.defaultOperationMode !== undefined || creating) {
      const mode = value.defaultOperationMode ?? "automatico";
      if (!isOperationMode(mode)) throw new BadRequestException("Modo de operação padrão inválido.");
      if (mode === "ignorar_permissoes") throw new BadRequestException("Ignorar permissões não pode ser padrão de agente.");
      result.defaultOperationMode = mode;
    }
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
  private parseModelRouting(raw: unknown): NonNullable<AgentInput["modelRouting"]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException("Configuração de modelos reserva inválida.");
    const value = raw as Record<string, unknown>;
    const target = (item: unknown): { providerId: string; model: string } => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new BadRequestException("Alvo de modelo inválido.");
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.providerId !== "string" || !this.isUuid(candidate.providerId) || typeof candidate.model !== "string" || !candidate.model.trim() || candidate.model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(candidate.model)) throw new BadRequestException("Informe um provedor e modelo válidos.");
      return { providerId: candidate.providerId.toLowerCase(), model: candidate.model };
    };
    const fallbacksRaw = value.fallbacks ?? [];
    if (!Array.isArray(fallbacksRaw) || fallbacksRaw.length > 5) throw new BadRequestException("Informe no máximo cinco modelos reserva.");
    const fallbacks = fallbacksRaw.map(target);
    const keys = fallbacks.map((item) => `${item.providerId}:${item.model}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException("A lista de modelos reserva não pode ter duplicados.");
    const tasksRaw = value.taskModels ?? {};
    if (!tasksRaw || typeof tasksRaw !== "object" || Array.isArray(tasksRaw)) throw new BadRequestException("Modelos por tipo de tarefa inválidos.");
    const tasks = tasksRaw as Record<string, unknown>;
    const taskModels: NonNullable<NonNullable<AgentInput["modelRouting"]>["taskModels"]> = {};
    for (const kind of ["vision", "code"] as const) if (tasks[kind] !== undefined && tasks[kind] !== null) taskModels[kind] = target(tasks[kind]);
    if (Object.keys(tasks).some((key) => key !== "vision" && key !== "code")) throw new BadRequestException("Tipo de tarefa inválido.");
    return { fallbacks, ...(Object.keys(taskModels).length ? { taskModels } : {}) };
  }
  private async validateRouting(input: Partial<AgentInput>): Promise<void> {
    if (!this.modelProviders) return;
    const targets = [
      ...(input.modelRouting?.fallbacks ?? []),
      ...Object.values(input.modelRouting?.taskModels ?? {}).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ];
    if (input.provider && this.isUuid(input.provider)) {
      if (!input.model) throw new BadRequestException("Informe um modelo para o provedor principal selecionado.");
      targets.push({ providerId: input.provider, model: input.model });
    }
    await Promise.all(targets.map((item) => this.modelProviders!.validateAgentTarget(item.providerId, item.model)));
  }
  private assertId(id: string) {
    if (!this.isUuid(id)) throw new BadRequestException("Identificador inválido.");
  }
  private isUuid(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
  private principal(request: PrincipalRequest): Principal {
    return request.principal ?? { id: "sistema", name: "Administrador", role: "admin" };
  }
}
