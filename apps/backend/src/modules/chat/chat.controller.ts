import { BadRequestException, Body, Controller, Get, Logger, Optional, Post, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { AgentsService } from "../agents/agents.service";
import { GroupsService } from "../agents/groups.service";
import { resolveGroupRecipient } from "./group-routing";
import { MAX_IMAGE_BYTES, validateImageAttachment } from "./image-attachments";
import { ProvidersService } from "../providers/providers.service";
import { CompletionTool, ProviderMessage, ProviderMessageRole, ProviderToolCall } from "../providers/provider.types";
import { ConversationsService, StoredAttachment } from "./conversations.service";
import { UsageService } from "./usage.service";
import { AuditService } from "../audit/audit.service";
import { MemoryService } from "../memory/memory.service";
import { markUntrusted, UNTRUSTED_GUIDANCE, withUntrustedNotice } from "../tools/untrusted-content";
import { ToolsService, ToolRun } from "../tools/tools.service";
import { MaskedTextStream } from "../../common/masked-text-stream";
import { maskSecrets } from "../../common/secret-masking";
import { generateConversationTitle } from "./conversation-title";
import { UserPreferencesService } from "../preferences/user-preferences.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { Principal } from "../auth/users.service";

const MAX_TOOL_ITERATIONS = 4;
const LOCAL_TOOLS = new Set(["tempo.agora", "memoria.listar", "memoria.apagar_tudo"]);

interface ChatRequest { principal?: Principal }
interface StreamedCompletion {
  content: string;
  toolCalls: ProviderToolCall[];
  model?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

async function readCompletion(response: globalThis.Response, stream: MaskedTextStream): Promise<StreamedCompletion> {
  if (!response.body) throw new Error("O modelo não retornou um fluxo de dados.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ProviderToolCall>();
  let pending = "", content = "", model: string | undefined;
  let usage: StreamedCompletion["usage"];
  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const event = JSON.parse(payload) as {
        model?: string;
        choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
      };
      if (event.model) model = event.model;
      if (event.usage) usage = {
        promptTokens: event.usage.prompt_tokens ?? 0,
        completionTokens: event.usage.completion_tokens ?? 0,
        totalTokens: event.usage.total_tokens ?? 0,
      };
      const delta = event.choices?.[0]?.delta;
      if (typeof delta?.content === "string") {
        content += delta.content;
        stream.push(delta.content);
      }
      for (const part of delta?.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments) call.function.arguments += part.function.arguments;
        calls.set(part.index, call);
      }
    } catch { /* ignore partial or non-JSON SSE data */ }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    pending += decoder.decode();
    if (pending) processLine(pending);
  } finally {
    reader.releaseLock();
  }
  return { content, toolCalls: [...calls.values()], ...(model ? { model } : {}), ...(usage ? { usage } : {}) };
}

function providerTools(definitions: ReturnType<ToolsService["catalog"]>): { tools: CompletionTool[]; names: Map<string, string>; risks: Map<string, "read" | "sensitive"> } {
  const names = new Map<string, string>();
  const risks = new Map<string, "read" | "sensitive">();
  const tools = definitions.map((tool) => {
    const name = tool.name.replace(/\./g, "__");
    names.set(name, tool.name);
    risks.set(name, tool.risk);
    if (tool.risk !== "read") return null;
    return {
      type: "function" as const,
      function: {
        name,
        description: tool.description,
        parameters: { type: "object" as const, properties: tool.parameters?.properties ?? {}, ...(tool.parameters?.required ? { required: tool.parameters.required } : {}), additionalProperties: true as const },
      },
    };
  }).filter((tool): tool is CompletionTool => tool !== null);
  return { tools, names, risks };
}

function resultForModel(toolName: string, run: ToolRun): string {
  if (run.status === "pending_approval") return JSON.stringify({ status: "aguardando aprovação" });
  const result = run.output;
  if (LOCAL_TOOLS.has(toolName)) return JSON.stringify(result ?? null);
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    return JSON.stringify(withUntrustedNotice(result as Record<string, unknown>, toolName));
  }
  return markUntrusted(JSON.stringify(result ?? null), toolName);
}

/** Um pedaço de texto da resposta. O fim do fluxo (`[DONE]`) é escrito uma única vez, no final. */
function sseTextChunk(text: string): Uint8Array {
  const event = { id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

const SSE_DONE = new TextEncoder().encode("data: [DONE]\n\n");

const ALLOWED_ROLES = new Set<ProviderMessageRole>(["system", "user", "assistant"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(private readonly providers: ProvidersService, private readonly conversations: ConversationsService, private readonly agents: AgentsService, private readonly groups: GroupsService, private readonly usage: UsageService, private readonly audit: AuditService, private readonly memory: MemoryService, private readonly toolsService: ToolsService, private readonly agentPermissions: AgentPermissionsService, @Optional() private readonly preferences?: UserPreferencesService, @Optional() private readonly notifications?: NotificationsService) {}

  @Get("providers") listProviders() { return this.providers.list(); }

  @Post("chat/completions")
  async complete(@Body() body: unknown, @Req() request: ChatRequest, @Res() res: Response) {
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
      for (const id of group.agentIds) await this.agentPermissions.assertCanUse(id, request.principal ?? { id: "sistema", name: "Administrador", role: "admin" });
      const members = await Promise.all(group.agentIds.map((id) => this.agents.get(id)));
      const routed = resolveGroupRecipient(group, members.filter((item): item is NonNullable<typeof item> => item !== null), messageText, agentId);
      agentId = routed.agentId; mentionRecords = routed.mentions;
    }
    if (agentId) await this.agentPermissions.assertCanUse(agentId, request.principal ?? { id: "sistema", name: "Administrador", role: "admin" });
    const agent = agentId ? await this.agents.get(agentId) : null;
    if (agentId && !agent) throw new BadRequestException("O agente associado não foi encontrado.");
    if (agent && !agent.enabled) throw new BadRequestException("O agente está inativo.");

    // System policy comes from the persisted profile, never from a desktop-provided prompt.
    const messages: ProviderMessage[] = clientMessages.filter((message) => message.role !== "system");
    // Keep the safety guidance server-owned and directly after the profile instructions.
    messages.unshift({ role: "system", content: UNTRUSTED_GUIDANCE });
    if (agent?.instructions.trim()) messages.unshift({ role: "system", content: agent.instructions.trim() });
    const userPreferences = await this.preferences?.read(request.principal?.id ?? "sistema").catch(() => null);
    if (userPreferences && (userPreferences.instructions || userPreferences.responseStyle !== "balanced")) {
      const guidance = messages.findIndex((message) => message.role === "system" && message.content === UNTRUSTED_GUIDANCE);
      const preferenceMessage = { role: "system" as const, content: `Preferências da pessoa: estilo de resposta ${userPreferences.responseStyle}.${userPreferences.instructions ? ` Instruções: ${userPreferences.instructions}` : ""}` };
      messages.splice(guidance < 0 ? messages.length : guidance, 0, preferenceMessage);
    }
    // Memórias salvas pela pessoa entram como contexto, só quando a memória está ligada.
    const memoryLines = await this.memory.contextLines(request.principal?.id ?? "local").catch(() => []);
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
        const conversationOwner = request.principal?.id ?? "sistema";
        await this.conversations.create(conversationId, messageText.slice(0, 120) || (attachments.length ? "Imagem enviada" : "Nova conversa"), agentId ?? undefined, groupId ?? undefined, conversationOwner);
        await this.conversations.addMessage(conversationId, "user", messageText || (attachments.length ? "[imagem anexada]" : ""), { ...(agentId ? { agentId } : {}), attachments, mentions: mentionRecords }, conversationOwner);
      } catch (error) { this.logger.warn(`Histórico não persistido: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
    }

    const availableTools = providerTools(this.toolsService.catalog());
    const completion = {
      provider: agent?.provider === "anthropic" ? "anthropic" as const : "openai" as const,
      tools: availableTools.tools,
      ...(effectiveModel === undefined ? {} : { model: effectiveModel }),
      ...(agent?.generationConfig ? { generationConfig: agent.generationConfig } : {}),
    };
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    let answer = "";
    let reportedModel = effectiveModel ?? "", usageReport = null as { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    try {
      let workingMessages = [...messages];
      const secrets = await this.toolsService.secretsForMasking();
      const mask = (text: string) => maskSecrets(text, secrets);
      for (let iteration = 0; !abort.signal.aborted; iteration += 1) {
        const upstream = await this.providers.stream({ ...completion, messages: workingMessages }, abort.signal);
        const stream = new MaskedTextStream(mask, (piece) => { res.write(sseTextChunk(piece)); });
        const round = await readCompletion(upstream, stream);
        if (round.model) reportedModel = round.model;
        if (round.usage) usageReport = {
          promptTokens: (usageReport?.promptTokens ?? 0) + round.usage.promptTokens,
          completionTokens: (usageReport?.completionTokens ?? 0) + round.usage.completionTokens,
          totalTokens: (usageReport?.totalTokens ?? 0) + round.usage.totalTokens,
        };
        if (!round.toolCalls.length) {
          stream.flush();
          answer = mask(round.content);
          break;
        }
        // Rodada de ferramenta: o que ainda estava segurado no buffer não é resposta.
        stream.discard();
        if (iteration >= MAX_TOOL_ITERATIONS) {
          answer = `Não foi possível concluir: o limite de ${MAX_TOOL_ITERATIONS} ciclos de ferramentas foi atingido.`;
          res.write(sseTextChunk(answer));
          try { await this.notifications?.create({ owner: request.principal?.id ?? "sistema", kind: "tool_limit.reached", title: "Limite de ferramentas atingido", body: `A conversa atingiu o limite de ${MAX_TOOL_ITERATIONS} ciclos.`, details: { conversationId: conversationId ?? null, limit: MAX_TOOL_ITERATIONS } }); } catch { /* notification storage must not interrupt the response */ }
          break;
        }
        workingMessages.push({ role: "assistant", content: round.content || null, tool_calls: round.toolCalls });
        for (const call of round.toolCalls) {
          const canonicalName = availableTools.names.get(call.function.name);
          if (!canonicalName) {
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Ferramenta indisponível." }) });
            continue;
          }
          let input: Record<string, unknown>;
          try {
            const parsed = JSON.parse(call.function.arguments || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid input");
            input = parsed as Record<string, unknown>;
          } catch {
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Argumentos da ferramenta inválidos." }) });
            continue;
          }
          try {
            if (availableTools.risks.get(call.function.name) === "sensitive") {
              const pending = await this.toolsService.invoke(canonicalName, input, request.principal?.name ?? "sistema", undefined, request.principal?.id);
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: resultForModel(canonicalName, pending) });
              continue;
            }
            const run = await this.toolsService.invoke(canonicalName, input, request.principal?.name ?? "sistema", agentId, request.principal?.id);
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: resultForModel(canonicalName, run) });
          } catch (error) {
            const message = await this.toolsService.maskSecretText(error instanceof Error ? error.message : "Ferramenta recusada.");
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message }) });
          }
        }
      }
      if (usageReport) {
        try {
          await this.usage.record({ conversationId, agentId, provider: "openai", model: reportedModel, ...usageReport });
        } catch (error) { this.logger.warn(`Consumo não registrado: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      }
      // Trilha de auditoria: só metadados da chamada, nunca o texto das mensagens.
      try {
        await this.audit.record({ action: "chat.completion", subject: conversationId ?? null, details: { agentId: agentId ?? null, model: reportedModel, completed: !abort.signal.aborted } });
      } catch (error) { this.logger.warn(`Auditoria não gravada: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      if (conversationId && answer) {
        try {
          const title = await generateConversationTitle((input) => this.providers.stream(input, abort.signal), effectiveModel, messageText, answer, agent?.provider === "anthropic" ? "anthropic" : "openai");
          if (title) await this.conversations.setTitleForFirstResponse(conversationId, title, request.principal?.id ?? "sistema");
        } catch { /* the current user-message title is the fallback */ }
        try { await this.conversations.addMessage(conversationId, "assistant", answer, agentId ? { agentId } : {}, request.principal?.id ?? "sistema"); }
        catch (error) { this.logger.warn(`Resposta enviada, mas não persistida: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      }
      if (!abort.signal.aborted) {
        res.write(SSE_DONE);
        res.end();
      }
    } finally { /* each provider stream reader is released after its response is consumed */ }
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
