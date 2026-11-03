import { BadRequestException, Body, Controller, Get, Logger, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { ProvidersService } from "../providers/providers.service";
import { ProviderMessage, ProviderMessageRole } from "../providers/provider.types";
import { ConversationsService } from "./conversations.service";

const ALLOWED_ROLES = new Set<ProviderMessageRole>(["system", "user", "assistant"]);

@Controller()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(private readonly providers: ProvidersService, private readonly conversations: ConversationsService) {}

  @Get("providers")
  listProviders() {
    return this.providers.list();
  }

  @Post("chat/completions")
  async complete(@Body() body: unknown, @Res() res: Response) {
    const messages = this.parseMessages(body);
    const model = this.parseModel(body);
    const conversationId = this.parseConversationId(body);
    const agentId = this.parseAgentId(body);
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    if (conversationId) {
      try {
        await this.conversations.create(conversationId, messages.find((message) => message.role === "user")?.content.slice(0, 120) ?? "Nova conversa", agentId);
        const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
        if (latestUserMessage) await this.conversations.addMessage(conversationId, "user", latestUserMessage.content);
      } catch (error) {
        this.logger.warn(`Histórico não persistido: ${error instanceof Error ? error.message : "falha no banco"}`);
      }
    }

    const upstream = await this.providers.stream(model === undefined ? { messages } : { messages, model }, abort.signal);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let answer = "";
    try {
      while (!abort.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            answer += event.choices?.[0]?.delta?.content ?? "";
          } catch { /* ignore non-JSON SSE comments and partial frames */ }
        }
        if (!res.write(value)) await new Promise<void>((resolve) => {
          const resume = () => { res.off("drain", resume); res.off("close", resume); resolve(); };
          res.once("drain", resume);
          res.once("close", resume);
        });
      }
      if (conversationId && answer) {
        try { await this.conversations.addMessage(conversationId, "assistant", answer); }
        catch (error) { this.logger.warn(`Resposta enviada, mas não persistida: ${error instanceof Error ? error.message : "falha no banco"}`); }
      }
      if (!abort.signal.aborted) res.end();
    } finally {
      if (abort.signal.aborted) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  private parseMessages(body: unknown): ProviderMessage[] {
    if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) {
      throw new BadRequestException("Envie uma lista de mensagens.");
    }
    const messages = (body as { messages: unknown[] }).messages;
    if (!messages.length || messages.length > 100) throw new BadRequestException("A conversa deve ter de 1 a 100 mensagens.");
    return messages.map((item) => {
      if (!item || typeof item !== "object") throw new BadRequestException("Mensagem inválida.");
      const value = item as { role?: unknown; content?: unknown };
      if (typeof value.role !== "string" || !ALLOWED_ROLES.has(value.role as ProviderMessageRole) || typeof value.content !== "string" || value.content.length > 100_000) {
        throw new BadRequestException("Mensagem inválida: role ou conteúdo não aceito.");
      }
      return { role: value.role as ProviderMessageRole, content: value.content };
    });
  }

  private parseModel(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const model = (body as { model?: unknown }).model;
    if (model === undefined) return undefined;
    if (typeof model !== "string" || model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new BadRequestException("Identificador de modelo inválido.");
    return model;
  }

  private parseConversationId(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const id = (body as { conversationId?: unknown }).conversationId;
    if (id === undefined) return undefined;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException("Identificador de conversa inválido.");
    return id;
  }

  private parseAgentId(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const id = (body as { agentId?: unknown }).agentId;
    if (id === undefined) return undefined;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException("Identificador de agente inválido.");
    return id;
  }
}
