import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { MaskedLogger } from "../../common/masked-logger";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AgentsService } from "../agents/agents.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { ProvidersService } from "../providers/providers.service";
import { ToolsService } from "../tools/tools.service";
import { AgentPolicyService } from "../tools/agent-policy.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AgentSkillsService } from "../skills/agent-skills.service";
import { buildSkillsSystemMessage } from "../skills/skill-prompt";
import { effectiveSkillTools } from "../skills/skill-tools";
import { CompletionTool, ProviderMessage, ProviderToolCall } from "../providers/provider.types";
import { markUntrusted, UNTRUSTED_GUIDANCE } from "../tools/untrusted-content";
import { maskSecrets } from "../../common/secret-masking";
import { ROUTINE_CLAIM_LEASE_MS, TICK_MS } from "../routines/routines.service";
import { Principal } from "../auth/users.service";

export const MIN_RESPONSIBILITY_INTERVAL_MINUTES = 60;
export const MAX_RESPONSIBILITY_INTERVAL_MINUTES = 1440;
export const MAX_ACTIVE_RESPONSIBILITIES = 5;
export const MAX_RESPONSIBILITY_RUNS_PER_DAY = 6;
export const MAX_RESPONSIBILITY_FAILURE_STREAK = 5;
export const MAX_RESPONSIBILITY_TOOL_ITERATIONS = 4;
const CLAIM_LEASE_MS = ROUTINE_CLAIM_LEASE_MS;
const COLUMNS = `id,owner_id AS "ownerId",agent_id AS "agentId",name,instructions,interval_minutes AS "intervalMinutes",
  enabled,next_run_at AS "nextRunAt",last_run_at AS "lastRunAt",last_status AS "lastStatus",failure_streak AS "failureStreak",
  runs_today AS "runsToday",runs_day AS "runsDay",last_result AS "lastResult",disabled_reason AS "disabledReason",
  created_at AS "createdAt",updated_at AS "updatedAt"`;
const NOT_FOUND = { code: "NOT_FOUND", message: "Responsabilidade não encontrada." };
const NEEDS_APPROVAL = "Esta ação precisa de aprovação e não roda em responsabilidades.";
const DEFAULT_PRINCIPAL: Principal = { id: "", name: "", role: "viewer" };

export interface ResponsibilityRecord {
  id: string; ownerId: string; agentId: string; name: string; instructions: string; intervalMinutes: number; enabled: boolean;
  nextRunAt: string; lastRunAt: string | null; lastStatus: string | null; failureStreak: number; runsToday: number;
  runsDay: string | null; lastResult: string; disabledReason: string | null; createdAt: string; updatedAt: string;
}

export interface ResponsibilityInput { name: unknown; instructions: unknown; agentId: unknown; intervalMinutes: unknown }
interface ResponsibilityRow extends ResponsibilityRecord { claimToken: string }
interface TurnResult { text: string; status: "done" | "failed" | "needs_approval" }

export function nextResponsibilityRun(now: Date, intervalMinutes: number): Date {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < MIN_RESPONSIBILITY_INTERVAL_MINUTES || intervalMinutes > MAX_RESPONSIBILITY_INTERVAL_MINUTES) {
    throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "O intervalo deve ser de 60 a 1440 minutos." });
  }
  return new Date(now.getTime() + intervalMinutes * 60_000);
}

export function validateResponsibilityInput(input: ResponsibilityInput): { name: string; instructions: string; agentId: string; intervalMinutes: number } {
  if (!input || typeof input !== "object" || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) {
    throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "O nome deve ter de 1 a 80 caracteres." });
  }
  if (typeof input.instructions !== "string" || !input.instructions.trim() || input.instructions.trim().length > 2000) {
    throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "A instrução deve ter de 1 a 2.000 caracteres." });
  }
  if (typeof input.agentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.agentId)) {
    throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "Selecione um bot acessível." });
  }
  nextResponsibilityRun(new Date(), input.intervalMinutes as number);
  return { name: input.name.trim(), instructions: input.instructions.trim(), agentId: input.agentId, intervalMinutes: input.intervalMinutes as number };
}

@Injectable()
export class ResponsibilitiesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new MaskedLogger(ResponsibilitiesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly permissions: AgentPermissionsService,
    private readonly providers: ProvidersService,
    private readonly tools: ToolsService,
    private readonly policies: AgentPolicyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly skills?: AgentSkillsService,
  ) {}

  onModuleInit(): void { void this.scheduleNextTick(); }
  onModuleDestroy(): void { if (this.timer) clearTimeout(this.timer); }

  async list(ownerId: string): Promise<ResponsibilityRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM responsibilities WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`, [ownerId]);
    return result.rows as ResponsibilityRecord[];
  }

  async create(ownerId: string, input: ResponsibilityInput): Promise<ResponsibilityRecord> {
    const value = validateResponsibilityInput(input);
    await this.assertAccessibleAgent(ownerId, value.agentId);
    await this.assertRoomForOneMore(ownerId);
    const nextRun = nextResponsibilityRun(new Date(), value.intervalMinutes);
    const result = await this.database.getPool().query(
      `INSERT INTO responsibilities(id,owner_id,agent_id,name,instructions,interval_minutes,next_run_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNS}`,
      [randomUUID(), ownerId, value.agentId, value.name, value.instructions, value.intervalMinutes, nextRun],
    );
    await this.scheduleNextTick();
    return result.rows[0] as ResponsibilityRecord;
  }

  async setEnabled(ownerId: string, id: string, enabled: boolean): Promise<ResponsibilityRecord> {
    if (enabled) {
      await this.getOwned(ownerId, id);
      await this.assertRoomForOneMore(ownerId, id);
      const existing = await this.getOwned(ownerId, id);
      await this.assertAccessibleAgent(ownerId, existing.agentId);
    }
    const result = enabled
      ? await this.database.getPool().query(
        `UPDATE responsibilities SET enabled=true,next_run_at=$3,failure_streak=0,disabled_reason=NULL,updated_at=now()
         WHERE id=$1 AND owner_id=$2 RETURNING ${COLUMNS}`,
        [id, ownerId, nextResponsibilityRun(new Date(), (await this.getOwned(ownerId, id)).intervalMinutes)],
      )
      : await this.database.getPool().query(`UPDATE responsibilities SET enabled=false,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING ${COLUMNS}`, [id, ownerId]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    await this.scheduleNextTick();
    return result.rows[0] as ResponsibilityRecord;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const result = await this.database.getPool().query("DELETE FROM responsibilities WHERE id=$1 AND owner_id=$2", [id, ownerId]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    await this.scheduleNextTick();
  }

  /** Claim with lease is persisted, so separate backend instances cannot run one item twice. */
  async tick(now = new Date()): Promise<number> {
    if (!this.database.isReady()) return 0;
    const claimToken = randomUUID();
    const due = await this.database.getPool().query(
      `WITH due AS (
         SELECT id FROM responsibilities WHERE enabled=true AND next_run_at<=$1
           AND (claim_until IS NULL OR claim_until<=$1)
         ORDER BY next_run_at ASC FOR UPDATE SKIP LOCKED LIMIT 20
       )
       UPDATE responsibilities r SET claim_until=$2,claim_token=$3 FROM due WHERE r.id=due.id
       RETURNING r.id,r.owner_id AS "ownerId",r.agent_id AS "agentId",r.name,r.instructions,
         r.interval_minutes AS "intervalMinutes",r.failure_streak AS "failureStreak",r.runs_today AS "runsToday",
         r.runs_day AS "runsDay",r.claim_token AS "claimToken"`,
      [now, new Date(now.getTime() + CLAIM_LEASE_MS), claimToken],
    );
    let handled = 0;
    for (const row of due.rows as ResponsibilityRow[]) {
      await this.runClaimed(row, now).catch(async (error) => {
        this.logger.warn(`Responsabilidade ${row.id} falhou: ${await this.tools.maskSecretText(error instanceof Error ? error.message : "erro")}`);
        await this.releaseFailedClaim(row, now);
      });
      handled += 1;
    }
    await this.scheduleNextTick();
    return handled;
  }

  private async runClaimed(row: ResponsibilityRow, now: Date): Promise<void> {
    const started = await this.database.getPool().query(
      `UPDATE responsibilities SET runs_today=CASE WHEN runs_day=$3::date THEN runs_today+1 ELSE 1 END,
         runs_day=$3::date WHERE id=$1 AND claim_token=$2 AND enabled=true AND
         CASE WHEN runs_day=$3::date THEN runs_today ELSE 0 END < $4 RETURNING runs_today`,
      [row.id, row.claimToken, now.toISOString().slice(0, 10), MAX_RESPONSIBILITY_RUNS_PER_DAY],
    );
    if (!started.rowCount) {
      await this.database.getPool().query(
        `UPDATE responsibilities SET last_run_at=$3,last_status='skipped_daily_limit',last_result='Limite diário de execuções atingido.',
          next_run_at=$4,updated_at=now(),claim_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2`,
        [row.id, row.claimToken, now, nextResponsibilityRun(now, row.intervalMinutes)],
      );
      await this.audit.record({ actor: row.ownerId, action: "responsibility.skipped", subject: row.id, details: { status: "skipped_daily_limit" } });
      await this.notifications.create({ owner: row.ownerId, kind: "responsibility.result", title: row.name.slice(0, 160), body: "Limite diário de execuções atingido.", details: { responsibilityId: row.id, status: "skipped_daily_limit" } }).catch(() => undefined);
      return;
    }

    let status: TurnResult["status"] = "done";
    let result = "";
    try {
      const agent = await this.agents.get(row.agentId);
      const access = await this.permissions.access(row.agentId, { ...DEFAULT_PRINCIPAL, id: row.ownerId });
      if (!agent || !agent.enabled || access === "none") throw new Error("O bot não está mais acessível ou está inativo.");
      const turn = await this.executeTurn(row, agent);
      status = turn.status;
      result = turn.text;
    } catch (error) {
      status = "failed";
      result = error instanceof Error ? error.message : "Falha ao executar a responsabilidade.";
    }
    await this.finish(row, now, { status, text: result });
  }

  private async executeTurn(row: ResponsibilityRow, agent: NonNullable<Awaited<ReturnType<AgentsService["get"]>>>): Promise<TurnResult> {
    const promptSkills = await this.skills?.loadPromptSkills(row.agentId).catch(() => []) ?? [];
    const messages: ProviderMessage[] = [{ role: "system", content: UNTRUSTED_GUIDANCE }];
    if (agent.instructions.trim()) messages.unshift({ role: "system", content: agent.instructions.trim() });
    const skillsPrompt = buildSkillsSystemMessage(promptSkills);
    if (skillsPrompt) messages.splice(agent.instructions.trim() ? 1 : 0, 0, { role: "system", content: skillsPrompt });
    messages.push({ role: "user", content: markUntrusted(row.instructions, "responsibility instruction") });

    const catalog = this.tools.catalog();
    const grantedNames = new Set([
      ...agent.toolsAllowed,
      ...promptSkills.flatMap((skill) => skill.tools),
    ]);
    const candidates = catalog.filter((tool) => tool.risk === "read" && grantedNames.has(tool.name));
    const decisions = new Map<string, "allow" | "ask" | "deny" | null>();
    for (const tool of candidates) decisions.set(tool.name, await this.policies.decisionFor(row.agentId, tool.name));
    const effective = effectiveSkillTools(promptSkills, new Set(candidates.filter((tool) => decisions.get(tool.name) !== "deny").map((tool) => tool.name)));
    const allowedTools = candidates.filter((tool) => decisions.get(tool.name) !== "deny" && (agent.toolsAllowed.includes(tool.name) || effective.includes(tool.name)));
    const offered = allowedTools.map((tool): CompletionTool => ({
      type: "function", function: { name: tool.name.replace(/\./g, "__"), description: tool.description,
        parameters: { type: "object", properties: tool.parameters?.properties ?? {}, ...(tool.parameters?.required ? { required: tool.parameters.required } : {}), additionalProperties: true } },
    }));
    const names = new Map(allowedTools.map((tool) => [tool.name.replace(/\./g, "__"), tool]));
    const provider = agent.provider === "anthropic" ? "anthropic" as const : "openai" as const;
    let output = "";
    for (let iteration = 0; iteration <= MAX_RESPONSIBILITY_TOOL_ITERATIONS; iteration += 1) {
      const response = await this.providers.stream({ provider, ...(agent.model ? { model: agent.model } : {}), generationConfig: agent.generationConfig, messages, tools: offered });
      const completion = await readTurn(response);
      output += completion.content;
      if (!completion.toolCalls.length) return { status: "done", text: output || "A responsabilidade foi executada sem texto de resposta." };
      if (iteration === MAX_RESPONSIBILITY_TOOL_ITERATIONS) return { status: "failed", text: "O bot atingiu o limite de ciclos de ferramentas." };
      messages.push({ role: "assistant", content: completion.content || null, tool_calls: completion.toolCalls });
      for (const call of completion.toolCalls) {
        const name = names.get(call.function.name);
        if (!name) {
          const sensitive = catalog.find((tool) => tool.name.replace(/\./g, "__") === call.function.name && tool.risk === "sensitive");
          if (sensitive) return { status: "needs_approval", text: NEEDS_APPROVAL };
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "failed", message: "Ferramenta indisponível para esta responsabilidade." }) });
          continue;
        }
        if (name.risk !== "read") return { status: "needs_approval", text: NEEDS_APPROVAL };
        let input: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(call.function.arguments || "{}");
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
          input = parsed as Record<string, unknown>;
        } catch {
          messages.push({ role: "tool", tool_call_id: call.id, content: "Argumentos da ferramenta inválidos." });
          continue;
        }
        const run = await this.tools.invoke(name.name, input, `responsibility:${row.id}`, row.agentId, row.ownerId);
        const serialized = await this.tools.maskSecretText(JSON.stringify(run.output ?? null));
        messages.push({ role: "tool", tool_call_id: call.id, content: markUntrusted(serialized, name.name) });
      }
    }
    return { status: "failed", text: "O turno não foi concluído." };
  }

  private async finish(row: ResponsibilityRow, now: Date, result: TurnResult): Promise<void> {
    const masked = (await this.tools.maskSecretText(result.text)).slice(0, 4000);
    const failed = result.status === "failed";
    const willDisable = failed && Number(row.failureStreak) + 1 >= MAX_RESPONSIBILITY_FAILURE_STREAK;
    const disabledReason = willDisable ? `Desligada após ${MAX_RESPONSIBILITY_FAILURE_STREAK} falhas seguidas.` : null;
    await this.database.getPool().query(
      `UPDATE responsibilities SET last_run_at=$3,last_status=$4,last_result=$5,
         next_run_at=$6,failure_streak=CASE WHEN $4='failed' THEN failure_streak+1 ELSE 0 END,
         enabled=CASE WHEN $4='failed' AND failure_streak+1 >= $7 THEN false ELSE enabled END,
         disabled_reason=CASE WHEN $4='failed' AND failure_streak+1 >= $7 THEN $8 ELSE NULL END,
         updated_at=now(),claim_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2`,
      [row.id, row.claimToken, now, result.status, masked, nextResponsibilityRun(now, row.intervalMinutes), MAX_RESPONSIBILITY_FAILURE_STREAK, disabledReason],
    );
    await this.audit.record({ actor: row.ownerId, action: "responsibility.run", subject: row.id, details: { status: result.status, disabled: Boolean(disabledReason) } });
    if (disabledReason) {
      await this.audit.record({ actor: row.ownerId, action: "responsibility.disabled", subject: row.id, details: { reason: disabledReason } });
      try { await this.notifications.create({ owner: row.ownerId, kind: "responsibility.disabled", title: `Responsabilidade ${row.name} desligada`, body: disabledReason, details: { responsibilityId: row.id } }); } catch { /* notification failure does not alter the execution */ }
    } else if (result.status !== "failed") {
      try { await this.notifications.create({ owner: row.ownerId, kind: "responsibility.result", title: row.name.slice(0, 160), body: masked, details: { responsibilityId: row.id, status: result.status } }); } catch { /* notification failure does not alter the execution */ }
    }
  }

  private async assertAccessibleAgent(ownerId: string, agentId: string): Promise<void> {
    const access = await this.permissions.access(agentId, { ...DEFAULT_PRINCIPAL, id: ownerId });
    if (access === "none") throw new BadRequestException({ code: "INVALID_RESPONSIBILITY", message: "O bot selecionado não está acessível." });
  }

  private async assertRoomForOneMore(ownerId: string, exceptId?: string): Promise<void> {
    const result = await this.database.getPool().query(
      `SELECT count(*)::int AS count FROM responsibilities WHERE owner_id=$1 AND enabled=true AND ($2::uuid IS NULL OR id<>$2)`, [ownerId, exceptId ?? null],
    );
    if (Number((result.rows[0] as { count: number }).count) >= MAX_ACTIVE_RESPONSIBILITIES) {
      throw new BadRequestException({ code: "RESPONSIBILITY_LIMIT", message: `Você já tem ${MAX_ACTIVE_RESPONSIBILITIES} responsabilidades ativas. Pause uma antes de ativar outra.` });
    }
  }

  private async getOwned(ownerId: string, id: string): Promise<ResponsibilityRecord> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM responsibilities WHERE id=$1 AND owner_id=$2`, [id, ownerId]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    return result.rows[0] as ResponsibilityRecord;
  }

  private async releaseFailedClaim(row: ResponsibilityRow, now: Date): Promise<void> {
    const result = await this.database.getPool().query(
      `UPDATE responsibilities SET last_run_at=$3,last_status='failed',last_result='Não foi possível concluir esta responsabilidade.',
         next_run_at=$4,failure_streak=failure_streak+1,
         enabled=CASE WHEN failure_streak+1 >= $5 THEN false ELSE enabled END,
         disabled_reason=CASE WHEN failure_streak+1 >= $5 THEN $6 ELSE NULL END,
         updated_at=now(),claim_until=NULL,claim_token=NULL
       WHERE id=$1 AND claim_token=$2 RETURNING failure_streak,enabled`,
      [row.id, row.claimToken, now, nextResponsibilityRun(now, row.intervalMinutes), MAX_RESPONSIBILITY_FAILURE_STREAK,
        `Desligada após ${MAX_RESPONSIBILITY_FAILURE_STREAK} falhas seguidas.`],
    );
    if (!result.rowCount) return;
    await this.audit.record({ actor: row.ownerId, action: "responsibility.run", subject: row.id, details: { status: "failed" } });
    const state = result.rows[0] as { failure_streak: number; enabled: boolean };
    if (!state.enabled && state.failure_streak >= MAX_RESPONSIBILITY_FAILURE_STREAK) {
      const reason = `Desligada após ${MAX_RESPONSIBILITY_FAILURE_STREAK} falhas seguidas.`;
      await this.audit.record({ actor: row.ownerId, action: "responsibility.disabled", subject: row.id, details: { reason } });
      try { await this.notifications.create({ owner: row.ownerId, kind: "responsibility.disabled", title: `Responsabilidade ${row.name} desligada`, body: reason, details: { responsibilityId: row.id } }); } catch { /* notification failure does not alter the execution */ }
    }
  }

  private async scheduleNextTick(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.database.isReady()) { this.armTimer(TICK_MS); return; }
    try {
      const result = await this.database.getPool().query("SELECT min(next_run_at) AS next FROM responsibilities WHERE enabled=true");
      const next = (result.rows[0] as { next: Date | string | null }).next;
      if (next) this.armTimer(Math.max(0, new Date(next).getTime() - Date.now()));
    } catch (error) {
      this.logger.warn(`Não foi possível preparar responsabilidades: ${await this.tools.maskSecretText(error instanceof Error ? error.message : "erro")}`);
      this.armTimer(TICK_MS);
    }
  }

  private armTimer(delay: number): void { this.timer = setTimeout(() => void this.tick(), delay); this.timer.unref(); }
}

async function readTurn(response: globalThis.Response): Promise<{ content: string; toolCalls: ProviderToolCall[] }> {
  if (!response.body) throw new Error("O provedor não retornou um fluxo de dados.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ProviderToolCall>();
  let pending = "", content = "";
  const parse = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const event = JSON.parse(payload) as { choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      const delta = event.choices?.[0]?.delta;
      if (typeof delta?.content === "string") content += delta.content;
      for (const part of delta?.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments) call.function.arguments += part.function.arguments;
        calls.set(part.index, call);
      }
    } catch { /* Ignore partial SSE events. */ }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const line of lines) parse(line.endsWith("\r") ? line.slice(0, -1) : line);
    }
    pending += decoder.decode(); if (pending) parse(pending);
  } finally { reader.releaseLock(); }
  return { content, toolCalls: [...calls.values()] };
}
