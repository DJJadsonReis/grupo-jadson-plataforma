import { BadRequestException, Body, Controller, Get, Logger, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { AgentsService } from "../agents/agents.service";
import { GroupsService } from "../agents/groups.service";
import { resolveGroupRecipient } from "./group-routing";
import { MAX_IMAGE_BYTES, validateImageAttachment } from "./image-attachments";
import { ProvidersService } from "../providers/providers.service";
import { ProviderMessage, ProviderMessageRole } from "../providers/provider.types";
import { ConversationsService, StoredAttachment } from "./conversations.service";
import { UsageService } from "./usage.service";
import { AuditService } from "../audit/audit.service";
import { MemoryService } from "../memory/memory.service";

const ALLOWED_ROLES = new Set<ProviderMessageRole>(["system", "user", "assistant"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(private readonly providers: ProvidersService, private readonly conversations: ConversationsService, private readonly agents: AgentsService, private readonly groups: GroupsService, private readonly usage: UsageService, private readonly audit: AuditService, private readonly memory: MemoryService) {}

  @Get("providers") listProviders() { return this.providers.list(); }

  @Post("chat/completions")
  async complete(@Body() body: unknown, @Res() res: Response) {
    const clientMessages = this.parseMessages(body);
    const model = this.parseModel(body);
    const conversationId = this.parseUuidField(body, "conversationId");
    let agentId = this.parseUuidField(body, "agentId");
    const groupId = this.parseUuidField(body, "groupId");
    const attachments = this.parseAttachments(body);
    const latestUser = [...clientMessages].reverse().find((message) => message.role === "user");
    if (!latestUser) throw new BadRequestException("A conversa precisa conter uma mensagem do usuário.");
    const messageText = typeof latestUser.content === "string" ? latestUser.content : "";
    let mentionRecords: { agentId: string; agentName: string; start: number; end: number }[] = [];
    if (groupId) {
      const group = await this.groups.get(groupId);
      if (!group || group.archived) throw new BadRequestException("O grupo não foi encontrado ou está arquivado.");
      const members = await Promise.all(group.agentIds.map((id) => this.agents.get(id)));
      const routed = resolveGroupRecipient(group, members.filter((item): item is NonNullable<typeof item> => item !== null), messageText, agentId);
      agentId = routed.agentId; mentionRecords = routed.mentions;
    }
    const agent = agentId ? await this.agents.get(agentId) : null;
    if (agentId && !agent) throw new BadRequestException("O agente associado não foi encontrado.");
    if (agent && !agent.enabled) throw new BadRequestException("O agente está inativo.");

    // System policy comes from the persisted profile, never from a desktop-provided prompt.
    const messages: ProviderMessage[] = clientMessages.filter((message) => message.role !== "system");
    if (agent?.instructions.trim()) messages.unshift({ role: "system", content: agent.instructions.trim() });
    // Memórias salvas pela pessoa entram como contexto, só quando a memória está ligada.
    const memoryLines = await this.memory.contextLines().catch(() => []);
    if (memoryLines.length) messages.unshift({ role: "system", content: `Memórias salvas pela pessoa (use só se forem relevantes):\n${memoryLines.map((line) => `- ${line}`).join("\n")}` });
    const effectiveModel = model ?? (agent?.model || undefined);
    if (attachments.length) {
      const text = typeof latestUser.content === "string" ? latestUser.content : "";
      latestUser.content = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...attachments.map((item) => ({ type: "image_url" as const, image_url: { url: item.dataUrl, detail: "auto" as const } })),
      ];
    }

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    if (conversationId) {
      try {
        await this.conversations.create(conversationId, messageText.slice(0, 120) || (attachments.length ? "Imagem enviada" : "Nova conversa"), agentId ?? undefined, groupId ?? undefined);
        await this.conversations.addMessage(conversationId, "user", messageText || (attachments.length ? "[imagem anexada]" : ""), { ...(agentId ? { agentId } : {}), attachments, mentions: mentionRecords });
      } catch (error) { this.logger.warn(`Histórico não persistido: ${error instanceof Error ? error.message : "falha no banco"}`); }
    }

    const completion = {
      messages,
      ...(effectiveModel === undefined ? {} : { model: effectiveModel }),
      ...(agent?.generationConfig ? { generationConfig: agent.generationConfig } : {}),
    };
    const upstream = await this.providers.stream(completion, abort.signal);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder(); let pending = "", answer = "";
    let reportedModel = effectiveModel ?? "", usageReport = null as { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    try {
      while (!abort.signal.aborted) {
        const { value, done } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim(); if (payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as { model?: string; choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null };
            answer += event.choices?.[0]?.delta?.content ?? "";
            if (event.model) reportedModel = event.model;
            if (event.usage) usageReport = { promptTokens: event.usage.prompt_tokens ?? 0, completionTokens: event.usage.completion_tokens ?? 0, totalTokens: event.usage.total_tokens ?? 0 };
          }
          catch { /* ignore partial/non-JSON SSE data */ }
        }
        if (!res.write(value)) await new Promise<void>((resolve) => {
          const resume = () => { res.off("drain", resume); res.off("close", resume); resolve(); };
          res.once("drain", resume); res.once("close", resume);
        });
      }
      if (usageReport) {
        try {
          await this.usage.record({ conversationId, agentId, provider: "openai", model: reportedModel, ...usageReport });
        } catch (error) { this.logger.warn(`Consumo não registrado: ${error instanceof Error ? error.message : "falha no banco"}`); }
      }
      // Trilha de auditoria: só metadados da chamada, nunca o texto das mensagens.
      try {
        await this.audit.record({ action: "chat.completion", subject: conversationId ?? null, details: { agentId: agentId ?? null, model: reportedModel, completed: !abort.signal.aborted } });
      } catch (error) { this.logger.warn(`Auditoria não gravada: ${error instanceof Error ? error.message : "falha no banco"}`); }
      if (conversationId && answer) {
        try { await this.conversations.addMessage(conversationId, "assistant", answer, agentId ? { agentId } : {}); }
        catch (error) { this.logger.warn(`Resposta enviada, mas não persistida: ${error instanceof Error ? error.message : "falha no banco"}`); }
      }
      if (!abort.signal.aborted) res.end();
    } finally { if (abort.signal.aborted) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }

  private parseMessages(body: unknown): ProviderMessage[] {
    if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) throw new BadRequestException("Envie uma lista de mensagens.");
    const input = (body as { messages: unknown[] }).messages;
    if (!input.length || input.length > 100) throw new BadRequestException("A conversa deve ter de 1 a 100 mensagens.");
    return input.map((item) => {
      if (!item || typeof item !== "object") throw new BadRequestException("Mensagem inválida.");
      const value = item as { role?: unknown; content?: unknown };
      if (typeof value.role !== "string" || !ALLOWED_ROLES.has(value.role as ProviderMessageRole) || typeof value.content !== "string" || value.content.length > 100_000) throw new BadRequestException("Mensagem inválida: role ou conteúdo não aceito.");
      return { role: value.role as ProviderMessageRole, content: value.content };
    });
  }
  private parseAttachments(body: unknown): StoredAttachment[] {
    if (!body || typeof body !== "object") return [];
    const raw = (body as { attachments?: unknown }).attachments;
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 4) throw new BadRequestException("Envie no máximo quatro imagens por mensagem.");
    let total = 0;
    return raw.map((value) => {
      const attachment = validateImageAttachment(value);
      total += attachment.size;
      if (total > MAX_IMAGE_BYTES) throw new BadRequestException("O total de imagens por mensagem não pode exceder 5 MB.");
      return attachment;
    });
  }
  private parseModel(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const model = (body as { model?: unknown }).model;
    if (model === undefined) return undefined;
    if (typeof model !== "string" || model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new BadRequestException("Identificador de modelo inválido.");
    return model;
  }
  private parseUuidField(body: unknown, field: "agentId" | "conversationId" | "groupId"): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const id = (body as Record<string, unknown>)[field];
    if (id === undefined) return undefined;
    if (typeof id !== "string" || !UUID.test(id)) throw new BadRequestException(`Identificador ${field} inválido.`);
    return id;
  }
}
