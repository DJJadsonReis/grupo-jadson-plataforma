import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { ConversationsService, StoredRole } from "./conversations.service";
import { Principal } from "../auth/users.service";

interface PrincipalRequest { principal?: Principal }

@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get() list(@Req() request: PrincipalRequest) { return this.conversations.list(request.principal?.id ?? "sistema"); }

  @Get(":id/operation-mode") operationMode(@Param("id") id: string, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new NotFoundException("Conversa não encontrada.");
    return this.conversations.operationMode(id, request.principal?.id ?? "sistema");
  }

  @Put(":id/operation-mode") setOperationMode(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new NotFoundException("Conversa não encontrada.");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Corpo de modo inválido.");
    const value = body as { mode?: unknown; confirmation?: unknown };
    const principal = request.principal ?? { id: "sistema", name: "Administrador", role: "admin" as const };
    return this.conversations.setOperationMode(id, principal.id, value.mode, principal.role, principal.name, value.confirmation);
  }

  @Get(":id/reasoning-effort") reasoningEffort(@Param("id") id: string, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new NotFoundException("Conversa não encontrada.");
    return this.conversations.reasoningEffort(id, request.principal?.id ?? "sistema");
  }

  @Put(":id/reasoning-effort") setReasoningEffort(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new NotFoundException("Conversa não encontrada.");
    if (!body || typeof body !== "object" || Array.isArray(body) || !("effort" in body)) throw new BadRequestException("Nível de esforço inválido.");
    const effort = (body as { effort: unknown }).effort;
    if (effort !== null && effort !== "baixo" && effort !== "medio" && effort !== "alto") throw new BadRequestException("Nível de esforço inválido.");
    return this.conversations.setReasoningEffort(id, request.principal?.id ?? "sistema", effort);
  }

  @Post() create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!body || typeof body !== "object") throw new BadRequestException("Corpo de conversa inválido.");
    const value = body as { id?: unknown; title?: unknown; agentId?: unknown };
    if (value.id !== undefined && (typeof value.id !== "string" || !this.isUuid(value.id))) throw new BadRequestException("Identificador de conversa inválido.");
    if (value.title !== undefined && typeof value.title !== "string") throw new BadRequestException("Título inválido.");
    if (value.agentId !== undefined && (typeof value.agentId !== "string" || !this.isUuid(value.agentId))) throw new BadRequestException("Identificador de agente inválido.");
    return this.conversations.create((value.id as string | undefined) ?? "", (value.title as string | undefined) ?? "Nova conversa", value.agentId as string | undefined, undefined, request.principal?.id ?? "sistema");
  }

  @Delete(":id") async remove(@Param("id") id: string, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new NotFoundException("Conversa n\u00e3o encontrada.");
    const removed = await this.conversations.remove(id, request.principal?.id ?? "sistema");
    if (!removed) throw new NotFoundException("Conversa não encontrada.");
    return { removed: true };
  }

  @Post(":id/messages") addMessage(@Param("id") id: string, @Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!this.isUuid(id)) throw new BadRequestException("Identificador de conversa inválido.");
    if (!body || typeof body !== "object") throw new BadRequestException("Corpo da mensagem inválido.");
    const value = body as { role?: unknown; content?: unknown };
    if (typeof value.role !== "string" || !["user", "assistant", "system"].includes(value.role) || typeof value.content !== "string" || value.content.length > 100_000) throw new BadRequestException("Mensagem inválida.");
    return this.conversations.addMessage(id, value.role as StoredRole, value.content, {}, request.principal?.id ?? "sistema");
  }

  private isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
}
