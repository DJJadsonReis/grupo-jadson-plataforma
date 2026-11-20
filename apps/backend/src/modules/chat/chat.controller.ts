import { BadRequestException, Body, Controller, Get, Logger, Optional, Post, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { randomUUID } from "node:crypto";
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
import { AgentPolicyService } from "../tools/agent-policy.service";
import { MaskedTextStream } from "../../common/masked-text-stream";
import { maskSecrets } from "../../common/secret-masking";
import { generateConversationTitle } from "./conversation-title";
import { UserPreferencesService } from "../preferences/user-preferences.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { Principal } from "../auth/users.service";
import { AgentSkillsService } from "../skills/agent-skills.service";
import { buildSkillsSystemMessage } from "../skills/skill-prompt";
import { DatabaseService } from "../database/database.service";
import { foundFrom, searchEnabled, searchTools, visibleTools } from "../tools/tool-search";
import { effectiveSkillTools } from "../skills/skill-tools";
import { AGENT_ENDPOINT_FAILED, callAgentEndpoint } from "../agents/agent-endpoint";
import { MAX_SUBAGENTS_PER_TURN, runSubagent } from "./subagents.service";
import { RICH_COMPONENTS_GUIDANCE } from "./rich-components-guidance";
import { classifyTask, failureReason, isRetryableModelError, modelAttempts } from "./model-routing";

const MAX_TOOL_ITERATIONS = 4;
export const MODEL_FIRST_RESPONSE_TIMEOUT_MS = 60_000;
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
function sseTextChunk(text: string, model?: string): Uint8Array {
  const event = { id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", ...(model ? { model } : {}), choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

const SSE_DONE = new TextEncoder().encode("data: [DONE]\n\n");

function sseMetadata(value: unknown): Uint8Array {
  return new TextEncoder().encode(`event: metadata\ndata: ${JSON.stringify(value)}\n\n`);
}

const ALLOWED_ROLES = new Set<ProviderMessageRole>(["system", "user", "assistant"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller()
export class ChatController {
  static firstResponseTimeoutMs = MODEL_FIRST_RESPONSE_TIMEOUT_MS;
  private readonly logger = new Logger(ChatController.name);
  private endpointFetcher?: Parameters<typeof callAgentEndpoint>[0]["fetcher"];
  private endpointLookup?: Parameters<typeof callAgentEndpoint>[0]["lookupHost"];
  constructor(private readonly providers: ProvidersService, private readonly conversations: ConversationsService, private readonly agents: AgentsService, private readonly groups: GroupsService, private readonly usage: UsageService, private readonly audit: AuditService, private readonly memory: MemoryService, private readonly toolsService: ToolsService, private readonly agentPermissions: AgentPermissionsService, @Optional() private readonly preferences?: UserPreferencesService, @Optional() private readonly notifications?: NotificationsService, @Optional() private readonly database?: DatabaseService) {}

  @Get("providers") listProviders() { return this.providers.list(); }

  @Post("chat/completions")
  async complete(@Body() body: unknown, @Req() request: ChatRequest, @Res() res: Response) {
    const clientMessages = this.parseMessages(body);
    const model = this.parseModel(body);
    const modelProviderId = this.parseUuidField(body, "modelProviderId");
    if (modelProviderId && !model) throw new BadRequestException("Informe também o modelo correspondente ao provedor selecionado.");
    if (modelProviderId) {
      try { await this.providers.validateManagedProvider(modelProviderId); }
      catch { throw new BadRequestException({ code: "PROVIDER_UNAVAILABLE", message: "O provedor selecionado está indisponível." }); }
    }
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
    const requestedModel = model ?? (agent?.model || undefined);
    if (agent?.providerKind !== "endpoint" && agent && requestedModel && UUID.test(agent.provider) && typeof this.providers.validateManagedModel === "function") {
      try { await this.providers.validateManagedModel(agent.provider, requestedModel); } catch (error) { throw this.modelUnavailableException(error); }
    }
    if (agent?.providerKind !== "endpoint" && agent?.modelRouting && typeof this.providers.validateManagedModel === "function") {
      const targets = [...(agent.modelRouting.fallbacks ?? []), ...Object.values(agent.modelRouting.taskModels ?? {}).filter((target): target is NonNullable<typeof target> => Boolean(target))];
      for (const target of targets) if (UUID.test(target.providerId)) {
        try { await this.providers.validateManagedModel(target.providerId, target.model); } catch (error) { throw this.modelUnavailableException(error); }
      }
    }

    // System policy comes from the persisted profile, never from a desktop-provided prompt.
    const messages: ProviderMessage[] = clientMessages.filter((message) => message.role !== "system");
    let promptSkills: Awaited<ReturnType<AgentSkillsService["loadPromptSkills"]>> = [];
    // Keep the safety guidance server-owned and directly after the profile instructions.
    messages.unshift({ role: "system", content: UNTRUSTED_GUIDANCE });
    messages.unshift({ role: "system", content: RICH_COMPONENTS_GUIDANCE });
    if (agent?.providerKind !== "endpoint" && agent?.instructions.trim()) messages.unshift({ role: "system", content: agent.instructions.trim() });
    if (agent?.providerKind !== "endpoint" && agentId && this.database) {
      promptSkills = await new AgentSkillsService(this.database).loadPromptSkills(agentId).catch(() => []);
      const skillsMessage = buildSkillsSystemMessage(promptSkills);
      if (skillsMessage) messages.splice(agent?.instructions.trim() ? 1 : 0, 0, { role: "system", content: skillsMessage });
    }
    const userPreferences = agent?.providerKind === "endpoint" ? null : await this.preferences?.read(request.principal?.id ?? "sistema").catch(() => null);
    if (userPreferences && (userPreferences.instructions || userPreferences.responseStyle !== "balanced")) {
      const guidance = messages.findIndex((message) => message.role === "system" && message.content === UNTRUSTED_GUIDANCE);
      const preferenceMessage = { role: "system" as const, content: `Preferências da pessoa: estilo de resposta ${userPreferences.responseStyle}.${userPreferences.instructions ? ` Instruções: ${userPreferences.instructions}` : ""}` };
      messages.splice(guidance < 0 ? messages.length : guidance, 0, preferenceMessage);
    }
    // Memórias salvas pela pessoa entram como contexto, só quando a memória está ligada.
    const memoryLines = agent?.providerKind === "endpoint" ? [] : await this.memory.contextLines(request.principal?.id ?? "local").catch(() => []);
    if (memoryLines.length) messages.unshift({ role: "system", content: `Memórias salvas pela pessoa (use só se forem relevantes):\n${memoryLines.map((line) => `- ${line}`).join("\n")}` });
    const effectiveModel = model ?? (agent?.model || undefined);
    if (!agent && modelProviderId && model && typeof this.providers.validateManagedModel === "function") {
      try { await this.providers.validateManagedModel(modelProviderId, model); } catch (error) { throw this.modelUnavailableException(error); }
    }
    if (attachments.length) {
      const text = typeof latestUser.content === "string" ? latestUser.content : "";
      const contentParts: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } })[] = [];
      if (text) contentParts.push({ type: "text", text });
      for (const item of attachments) {
        if (item.type.startsWith("image/")) contentParts.push({ type: "image_url", image_url: { url: item.dataUrl, detail: "auto" } });
        else contentParts.push({ type: "text", text: `Arquivo de código ${item.name}:\n${this.decodeCodeAttachment(item.dataUrl)}` });
      }
      latestUser.content = contentParts;
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

    const toolCatalog = this.toolsService.catalog();
    const searchActive = searchEnabled(toolCatalog);
    const allAvailableTools = providerTools(toolCatalog);
    let grantedSkillTools: ReturnType<typeof providerTools> = providerTools([]);
    if (agentId && promptSkills.length) {
      try {
        const grantedNames = new Set(promptSkills.flatMap((skill) => skill.tools));
        const candidateTools = toolCatalog.filter((tool) => grantedNames.has(tool.name));
        const policies = (this.toolsService as unknown as { policies: AgentPolicyService }).policies;
        const allowed = new Set((await Promise.all(candidateTools.map(async (tool) =>
          (await policies.decisionFor(agentId, tool.name)) !== "deny" ? tool.name : null,
        ))).filter((name): name is string => name !== null));
        const effectiveNames = new Set(effectiveSkillTools(promptSkills, allowed));
        const grantedDefinitions = toolCatalog.filter((tool) => effectiveNames.has(tool.name));
        const providerGranted = providerTools(grantedDefinitions);
        const offeredNames = new Set(providerGranted.tools.map((tool) => tool.function.name));
        const sensitiveGranted = grantedDefinitions.filter((tool) => tool.risk === "sensitive").map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name.replace(/\./g, "__"),
            description: tool.description,
            parameters: { type: "object" as const, properties: tool.parameters?.properties ?? {}, ...(tool.parameters?.required ? { required: tool.parameters.required } : {}), additionalProperties: true as const },
          },
        }));
        grantedSkillTools = {
          ...providerGranted,
          tools: [...providerGranted.tools, ...sensitiveGranted.filter((tool) => !offeredNames.has(tool.function.name))],
        };
      } catch (error) {
        this.logger.warn(`Concessões de ferramentas por habilidade ignoradas: ${error instanceof Error ? error.message : "falha ao consultar política"}`);
      }
    }
    const found = new Set<string>();
    const primaryProvider = modelProviderId ?? (agent?.provider && UUID.test(agent.provider) ? agent.provider : agent?.provider ?? "openai");
    const completion = {
      provider: primaryProvider === "anthropic" ? "anthropic" as const : "openai" as const,
      ...(UUID.test(primaryProvider) ? { providerId: primaryProvider } : {}),
      ...(effectiveModel === undefined ? {} : { model: effectiveModel }),
      ...(agent?.generationConfig ? { generationConfig: agent.generationConfig } : {}),
    };
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (groupId) res.write(sseMetadata({ type: "group-routing", agentId, mentions: mentionRecords }));
    let answer = "";
    let reportedModel = effectiveModel ?? "", usageReport = null as { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    let reportedProviderId: string | undefined = UUID.test(primaryProvider) ? primaryProvider : undefined;
    try {
      if (agent?.providerKind === "endpoint") {
        try {
          const credentials = await this.agents.endpointCredentials(agent.id);
          if (!credentials) throw new Error(AGENT_ENDPOINT_FAILED);
          answer = await callAgentEndpoint({ url: credentials.url, token: credentials.token, conversationId, messages: clientMessages.map((message) => ({ role: message.role, content: typeof message.content === "string" ? message.content : "" })), agent: { id: agent.id, name: agent.name }, timeoutMs: 30_000, ...(this.endpointFetcher ? { fetcher: this.endpointFetcher } : {}), ...(this.endpointLookup ? { lookupHost: this.endpointLookup } : {}) });
          res.write(sseTextChunk(answer));
        } catch {
          answer = "Não foi possível obter uma resposta do endpoint do agente.";
          res.write(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ code: "AGENT_ENDPOINT_FAILED", message: answer })}\n\n`));
          try { if (conversationId) await this.conversations.addMessage(conversationId, "assistant", answer, agentId ? { agentId } : {}, request.principal?.id ?? "sistema"); } catch { /* best effort */ }
          if (!abort.signal.aborted) { res.write(SSE_DONE); res.end(); }
          return;
        }
      } else {
      let workingMessages = [...messages];
      let subagentCalls = 0;
      let subagentToolsUsed = 0;
      const secrets = await this.toolsService.secretsForMasking();
      const mask = (text: string) => maskSecrets(text, secrets);
      const task = classifyTask(messageText, attachments.some((item) => item.type.startsWith("image/")), attachments);
      const attempts = agent && !modelProviderId && effectiveModel
        ? modelAttempts({ providerId: UUID.test(agent.provider) ? agent.provider : "legacy", model: effectiveModel }, agent.modelRouting, task)
        : [{ providerId: primaryProvider, model: effectiveModel ?? "", fallback: false }];
      let attemptIndex = 0;
      let usedFallback: { providerId: string; model: string; reason: string } | null = null;
      for (let iteration = 0; !abort.signal.aborted; iteration += 1) {
        const visible = providerTools(visibleTools(toolCatalog, found));
        const availableTools = {
          tools: [...visible.tools, ...grantedSkillTools.tools.filter((tool) => !visible.names.has(tool.function.name))],
          names: new Map([...visible.names, ...grantedSkillTools.names]),
          risks: new Map([...visible.risks, ...grantedSkillTools.risks]),
        };
        let round: StreamedCompletion | undefined;
        let stream: MaskedTextStream | undefined;
        for (let index = attemptIndex; index < attempts.length; index += 1) {
          const target = attempts[index]!;
          let emittedText = false;
          try {
            const targetCompletion = {
              ...completion,
              provider: target.providerId === "anthropic" ? "anthropic" as const : "openai" as const,
              ...(UUID.test(target.providerId) ? { providerId: target.providerId } : {}),
              model: target.model,
              tools: availableTools.tools,
              messages: workingMessages,
            };
            const firstResponseController = new AbortController();
            const abortFirstResponse = () => firstResponseController.abort(abort.signal.reason);
            abort.signal.addEventListener("abort", abortFirstResponse, { once: true });
            const timeout = setTimeout(() => {
              const error = new Error("Tempo limite para a primeira resposta do modelo.");
              error.name = "TimeoutError";
              firstResponseController.abort(error);
            }, ChatController.firstResponseTimeoutMs);
            let upstream: globalThis.Response;
            try {
              upstream = await this.providers.stream(targetCompletion, firstResponseController.signal);
              clearTimeout(timeout);
            } catch (error) {
              clearTimeout(timeout);
              abort.signal.removeEventListener("abort", abortFirstResponse);
              throw error;
            }
            stream = new MaskedTextStream(mask, (piece) => { emittedText = true; res.write(sseTextChunk(piece, target.model)); });
            try { round = await readCompletion(upstream, stream); }
            finally { abort.signal.removeEventListener("abort", abortFirstResponse); }
            attemptIndex = index;
            if (target.fallback && usedFallback) {
              try { await this.audit.record({ action: "model.fallback", subject: conversationId ?? null, details: { agentId: agentId ?? null, providerId: target.providerId, model: target.model, reason: usedFallback.reason } }); }
              catch { this.logger.warn("Auditoria de failover do modelo não foi gravada."); }
              usedFallback = null;
            }
            break;
          } catch (error) {
            stream?.discard();
            if (!isRetryableModelError(error, emittedText, abort.signal.aborted) || index + 1 >= attempts.length) throw error;
            const next = attempts[index + 1]!;
            usedFallback = { providerId: next.providerId, model: next.model, reason: failureReason(error) };
            attemptIndex = index + 1;
          }
        }
        if (!round) break;
        reportedModel = round.model || attempts[attemptIndex]?.model || reportedModel;
        reportedProviderId = UUID.test(attempts[attemptIndex]?.providerId ?? "") ? attempts[attemptIndex]!.providerId : undefined;
        if (round.usage) usageReport = {
          promptTokens: (usageReport?.promptTokens ?? 0) + round.usage.promptTokens,
          completionTokens: (usageReport?.completionTokens ?? 0) + round.usage.completionTokens,
          totalTokens: (usageReport?.totalTokens ?? 0) + round.usage.totalTokens,
        };
        if (!round.toolCalls.length) {
          stream?.flush();
          answer = mask(round.content);
          break;
        }
        // Rodada de ferramenta: o que ainda estava segurado no buffer não é resposta.
        stream?.discard();
        if (iteration >= MAX_TOOL_ITERATIONS) {
          answer = `Não foi possível concluir: o limite de ${MAX_TOOL_ITERATIONS} ciclos de ferramentas foi atingido.`;
          res.write(sseTextChunk(answer));
          try { await this.notifications?.create({ owner: request.principal?.id ?? "sistema", kind: "tool_limit.reached", title: "Limite de ferramentas atingido", body: `A conversa atingiu o limite de ${MAX_TOOL_ITERATIONS} ciclos.`, details: { conversationId: conversationId ?? null, limit: MAX_TOOL_ITERATIONS } }); } catch { /* notification storage must not interrupt the response */ }
          break;
        }
        workingMessages.push({ role: "assistant", content: round.content || null, tool_calls: round.toolCalls });
        for (const call of round.toolCalls) {
          let input: Record<string, unknown>;
          try {
            const parsed = JSON.parse(call.function.arguments || "{}");
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid input");
            input = parsed as Record<string, unknown>;
          } catch {
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Argumentos da ferramenta inválidos." }) });
            continue;
          }
          if (searchActive && call.function.name === "ferramentas__buscar") {
            if (typeof input.consulta !== "string") {
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Informe a consulta da busca." }) });
              continue;
            }
            const results = searchTools(input.consulta, toolCatalog);
            for (const name of foundFrom(results)) {
              found.delete(name);
              found.add(name);
              if (found.size > 20) found.delete(found.values().next().value as string);
            }
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "done", resultados: results }) });
            continue;
          }
          if (call.function.name === "subagente__delegar") {
            if (typeof input.tarefa !== "string" || !input.tarefa.trim() || input.tarefa.length > 2000) {
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Informe uma tarefa com até 2000 caracteres." }) });
              continue;
            }
            if (subagentCalls >= MAX_SUBAGENTS_PER_TURN) {
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Limite de 3 subagentes por resposta." }) });
              continue;
            }
            subagentCalls += 1;
            const grantedNames = new Set([
              ...visibleTools(toolCatalog, found).filter((tool) => !["subagente.delegar", "ferramentas.buscar"].includes(tool.name)).map((tool) => tool.name),
              ...[...grantedSkillTools.names.values()],
            ]);
            const grantedTools = toolCatalog.filter((tool) => grantedNames.has(tool.name) && tool.name !== "subagente.delegar");
            try {
              const result = await runSubagent({
                task: input.tarefa,
                bot: { instructions: [agent?.instructions.trim(), buildSkillsSystemMessage(promptSkills), ...messages.filter((message) => message.role === "system" && message.content !== UNTRUSTED_GUIDANCE && !String(message.content).startsWith("Memórias salvas pela pessoa") && !String(message.content).startsWith("Preferências da pessoa:")).map((message) => typeof message.content === "string" ? message.content : "")].filter(Boolean).join("\n\n"), systemMessages: [agent?.instructions.trim(), buildSkillsSystemMessage(promptSkills), ...messages.filter((message) => message.role === "system" && message.content !== UNTRUSTED_GUIDANCE && !String(message.content).startsWith("Memórias salvas pela pessoa") && !String(message.content).startsWith("Preferências da pessoa:")).map((message) => typeof message.content === "string" ? message.content : "")].filter((content): content is string => Boolean(content)), ...(effectiveModel ? { model: effectiveModel } : {}), provider: completion.provider, ...(completion.generationConfig ? { generationConfig: completion.generationConfig } : {}) },
                // O serviço recebe instruções, não o histórico original. A tarefa é o único turno de usuário.
                grantedTools,
                runTurn: async (subagentInput) => {
                  const upstreamSubagent = await this.providers.stream(structuredClone(subagentInput), abort.signal);
                  // Preserve a snapshot for callers that instrument provider requests; the outer chat mutates its own history.
                  const subagentStream = new MaskedTextStream(mask, () => undefined);
                  const subagentRound = await readCompletion(upstreamSubagent, subagentStream);
                  subagentStream.flush();
                  return { content: subagentRound.content, toolCalls: subagentRound.toolCalls };
                },
                limits: {
                  mask,
                  invokeTool: async (name, args) => {
                    const value = await this.toolsService.invoke(name, args, request.principal?.name ?? "sistema", agentId, request.principal?.id);
                    return withUntrustedNotice(typeof value.output === "object" && value.output !== null ? value.output as Record<string, unknown> : { resultado: value.output }, name);
                  },
                },
              });
              subagentToolsUsed += result.ferramentas;
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: result.texto });
              try {
                await this.audit.record({ action: "subagent.run", subject: conversationId ?? null, details: { agentId: agentId ?? null, conversationId: conversationId ?? null, depth: 1, toolsUsed: result.ferramentas, outputSize: result.texto.length } });
              } catch (error) { this.logger.warn(`Auditoria de subagente nÃ£o gravada: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
            } catch (error) {
              const safe = await this.toolsService.maskSecretText(error instanceof Error ? error.message : "Falha no subagente.");
              workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: safe }) });
            }
            continue;
          }
          const canonicalName = allAvailableTools.names.get(call.function.name);
          if (!canonicalName) {
            workingMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Ferramenta indisponível." }) });
            continue;
          }
          try {
            if (allAvailableTools.risks.get(call.function.name) === "sensitive") {
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
      }
      if (usageReport) {
        try {
          await this.usage.record({ conversationId, agentId, ownerId: request.principal?.id ?? "sistema", provider: "openai", model: reportedModel, ...usageReport });
        } catch (error) { this.logger.warn(`Consumo não registrado: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      }
      // Trilha de auditoria: só metadados da chamada, nunca o texto das mensagens.
      try {
        await this.audit.record({ action: "chat.completion", subject: conversationId ?? null, details: { agentId: agentId ?? null, model: reportedModel, completed: !abort.signal.aborted } });
      } catch (error) { this.logger.warn(`Auditoria não gravada: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      if (conversationId && answer) {
        try {
          if (agent?.providerKind === "endpoint") throw new Error("endpoint title generation disabled");
          const title = await generateConversationTitle((input) => this.providers.stream({ ...input, ...(reportedProviderId ? { providerId: reportedProviderId } : {}) }, abort.signal), reportedModel || effectiveModel, messageText, answer, agent?.provider === "anthropic" ? "anthropic" : "openai");
          if (title) await this.conversations.setTitleForFirstResponse(conversationId, title, request.principal?.id ?? "sistema");
        } catch { /* the current user-message title is the fallback */ }
        try { await this.conversations.addMessage(conversationId, "assistant", answer, agentId ? { agentId } : {}, request.principal?.id ?? "sistema"); }
        catch (error) { this.logger.warn(`Resposta enviada, mas não persistida: ${await this.toolsService.maskSecretText(error instanceof Error ? error.message : "falha no banco")}`); }
      }
      if (!abort.signal.aborted) {
        res.write(SSE_DONE);
        res.end();
      }
    } catch (error) {
      const payload = error && typeof error === "object" && "getResponse" in error && typeof (error as { getResponse?: unknown }).getResponse === "function"
        ? (error as { getResponse: () => unknown }).getResponse() : null;
      const unavailable = payload && typeof payload === "object" && (payload as { code?: unknown }).code === "MODEL_UNAVAILABLE"
        ? { code: "MODEL_UNAVAILABLE", message: String((payload as { message?: unknown }).message ?? "O modelo está indisponível. Escolha outro modelo antes de continuar.") }
        : { code: "AI_PROVIDER_REQUEST_FAILED", message: "Não foi possível obter uma resposta do provedor de IA." };
      if (!abort.signal.aborted && !res.writableEnded) {
        res.write(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify(unavailable)}\n\n`));
        res.write(SSE_DONE);
        res.end();
      }
    } finally { /* each provider stream reader is released after its response is consumed */ }
  }

  private modelUnavailableException(error: unknown): BadRequestException {
    const payload = error && typeof error === "object" && "getResponse" in error && typeof (error as { getResponse?: unknown }).getResponse === "function" ? (error as { getResponse: () => unknown }).getResponse() : null;
    if (payload && typeof payload === "object" && (payload as { code?: unknown }).code === "MODEL_UNAVAILABLE") return new BadRequestException(payload);
    return new BadRequestException({ code: "MODEL_UNAVAILABLE", message: "O modelo está indisponível neste provedor. Escolha outro modelo antes de continuar." });
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
    if (!Array.isArray(raw) || raw.length > 4) throw new BadRequestException("Envie no máximo quatro anexos por mensagem.");
    let total = 0;
    return raw.map((value) => {
      const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const name = typeof candidate.name === "string" ? candidate.name : "";
      const type = typeof candidate.type === "string" ? candidate.type : "";
      const isCode = /\.(?:c|cc|cpp|cs|go|h|java|js|jsx|php|py|rb|rs|sh|sql|ts|tsx|json|yaml|yml|toml|md)$/i.test(name);
      const attachment = isCode && type !== "application/pdf" ? this.validateCodeAttachment(candidate) : validateImageAttachment(value);
      total += attachment.size;
      if (total > MAX_IMAGE_BYTES) throw new BadRequestException("O total de anexos por mensagem não pode exceder 5 MB.");
      return attachment;
    });
  }
  private validateCodeAttachment(item: Record<string, unknown>): StoredAttachment {
    if (typeof item.name !== "string" || item.name.length > 240 || typeof item.type !== "string" || typeof item.dataUrl !== "string") throw new BadRequestException("Anexo de código inválido.");
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(item.dataUrl);
    if (!match) throw new BadRequestException("Conteúdo do anexo de código inválido.");
    const bytes = Buffer.from(match[1]!, "base64");
    if (!bytes.length || bytes.length > 1024 * 1024 || (typeof item.size === "number" && item.size !== bytes.length)) throw new BadRequestException("O anexo de código deve ter até 1 MB.");
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new BadRequestException("O anexo precisa ser um arquivo de texto UTF-8."); }
    return { id: typeof item.id === "string" && UUID.test(item.id) ? item.id : randomUUID(), name: item.name, type: item.type || "text/plain", size: bytes.length, dataUrl: item.dataUrl };
  }
  private decodeCodeAttachment(dataUrl: string): string {
    const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  private parseModel(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const model = (body as { model?: unknown }).model;
    if (model === undefined) return undefined;
    if (typeof model !== "string" || model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new BadRequestException("Identificador de modelo inválido.");
    return model;
  }
  private parseUuidField(body: unknown, field: "agentId" | "conversationId" | "groupId" | "modelProviderId"): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const id = (body as Record<string, unknown>)[field];
    if (id === undefined) return undefined;
    if (typeof id !== "string" || !UUID.test(id)) throw new BadRequestException(`Identificador ${field} inválido.`);
    return id;
  }
}
