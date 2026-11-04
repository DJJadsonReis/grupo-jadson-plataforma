import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { GroupMode, GroupsService } from "./groups.service";

@Controller("groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Get() list() { return this.groups.list(); }
  @Post() save(@Body() body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Corpo de grupo inválido.");
    const v = body as Record<string, unknown>;
    if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 120) throw new BadRequestException("Nome do grupo inválido.");
    const mode = v.mode ?? "manual";
    if (mode !== "manual" && mode !== "mention" && mode !== "coordinated") throw new BadRequestException("Modo inválido.");
    const agentIds = v.agentIds ?? [];
    if (!Array.isArray(agentIds) || agentIds.length > 20 || agentIds.some((id) => typeof id !== "string" || !this.isUuid(id))) throw new BadRequestException("Participantes inválidos.");
    const id = v.id;
    const coordinatorId = v.coordinatorId ?? null;
    if (id !== undefined && (typeof id !== "string" || !this.isUuid(id))) throw new BadRequestException("Identificador do grupo inválido.");
    if (coordinatorId !== null && (typeof coordinatorId !== "string" || !this.isUuid(coordinatorId))) throw new BadRequestException("Coordenador inválido.");
    if (coordinatorId && !agentIds.includes(coordinatorId)) throw new BadRequestException("O coordenador precisa ser participante.");
    const participantRoles = v.participantRoles ?? {};
    if (!participantRoles || typeof participantRoles !== "object" || Array.isArray(participantRoles) || Object.entries(participantRoles).some(([id, role]) => !agentIds.includes(id) || typeof role !== "string" || role.length > 120)) throw new BadRequestException("Funções dos participantes inválidas.");
    const avatar = v.avatar ?? "", description = v.description ?? "";
    if (typeof avatar !== "string" || avatar.length > 2_000_000 || typeof description !== "string" || description.length > 1000) throw new BadRequestException("Avatar ou descrição inválidos.");
    return this.groups.save({ ...(id ? { id } : {}), name: v.name.trim(), avatar, description, mode: mode as GroupMode, coordinatorId: coordinatorId as string | null, agentIds: agentIds as string[], participantRoles: participantRoles as Record<string, string> });
  }
  @Delete(":id") archive(@Param("id") id: string) { if (!this.isUuid(id)) throw new BadRequestException("Identificador inválido."); return this.groups.archive(id).then(() => ({ archived: true })); }
  private isUuid(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
}
