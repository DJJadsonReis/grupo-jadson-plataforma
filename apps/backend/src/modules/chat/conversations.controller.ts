import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ConversationsService, StoredRole } from "./conversations.service";

@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get() list() { return this.conversations.list(); }

  @Post() create(@Body() body: unknown) {
    if (!body || typeof body !== "object") throw new BadRequestException("Corpo de conversa inválido.");
    const value = body as { id?: unknown; title?: unknown; agentId?: unknown };
    if (value.id !== undefined && (typeof value.id !== "string" || !this.isUuid(value.id))) throw new BadRequestException("Identificador de conversa inválido.");
    if (value.title !== undefined && typeof value.title !== "string") throw new BadRequestException("Título inválido.");
    if (value.agentId !== undefined && (typeof value.agentId !== "string" || !this.isUuid(value.agentId))) throw new BadRequestException("Identificador de agente inválido.");
    return this.conversations.create((value.id as string | undefined) ?? "", (value.title as string | undefined) ?? "Nova conversa", value.agentId as string | undefined);
  }

  @Delete(":id") async remove(@Param("id") id: string) {
    if (!this.isUuid(id)) throw new BadRequestException("Identificador de conversa inválido.");
    const removed = await this.conversations.remove(id);
    if (!removed) throw new NotFoundException("Conversa não encontrada.");
    return { removed: true };
  }

  @Post(":id/messages") addMessage(@Param("id") id: string, @Body() body: unknown) {
    if (!this.isUuid(id)) throw new BadRequestException("Identificador de conversa inválido.");
    if (!body || typeof body !== "object") throw new BadRequestException("Corpo da mensagem inválido.");
    const value = body as { role?: unknown; content?: unknown };
    if (typeof value.role !== "string" || !["user", "assistant", "system"].includes(value.role) || typeof value.content !== "string" || value.content.length > 100_000) throw new BadRequestException("Mensagem inválida.");
    return this.conversations.addMessage(id, value.role as StoredRole, value.content);
  }

  private isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
}
