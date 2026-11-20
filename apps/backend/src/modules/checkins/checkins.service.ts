import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
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
import { ROUTINE_CLAIM_LEASE_MS, TICK_MS } from "../routines/routines.service";
import { Principal } from "../auth/users.service";

export const MIN_CHECKIN_INTERVAL_MINUTES = 60;
export const MAX_CHECKIN_INTERVAL_MINUTES = 1440;
export const MAX_ACTIVE_CHECKINS = 5;
export const MAX_CHECKIN_RUNS_PER_DAY = 6;
export const MAX_CHECKIN_FAILURE_STREAK = 5;
export const CHECKIN_HIDDEN_DAYS = 30;
const CLAIM_LEASE_MS = ROUTINE_CLAIM_LEASE_MS;
const COLUMNS = `id,owner_id AS "ownerId",agent_id AS "agentId",focus,interval_minutes AS "intervalMinutes",enabled,
 next_run_at AS "nextRunAt",last_run_at AS "lastRunAt",last_status AS "lastStatus",failure_streak AS "failureStreak",
 disabled_reason AS "disabledReason",created_at AS "createdAt",updated_at AS "updatedAt"`;
const SUGGESTION_COLUMNS = `id,owner_id AS "ownerId",checkin_id AS "checkinId",title,text,source_link AS "sourceLink",status,conversation_id AS "conversationId",created_at AS "createdAt"`;
const NOT_FOUND = { code: "NOT_FOUND", message: "Check-in ou sugestão não encontrada." };
const DEFAULT_PRINCIPAL: Principal = { id: "", name: "", role: "viewer" };
const NOTHING_NEW = "Nada novo desde a última verificação";

export interface CheckinRecord { id: string; ownerId: string; agentId: string; focus: string; intervalMinutes: number; enabled: boolean; nextRunAt: string; lastRunAt: string | null; lastStatus: string | null; failureStreak: number; disabledReason: string | null; createdAt: string; updatedAt: string; }
export interface CheckinSuggestion { id: string; ownerId: string; checkinId: string; title: string; text: string; sourceLink: string | null; status: "aberta" | "ocultada" | "iniciada"; conversationId: string | null; createdAt: string; }
export function titleKey(title: string): string { return title.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?…。؟]+$/u, "").trim(); }
export function validateCheckinInput(input: { focus?: unknown; intervalMinutes?: unknown }): { focus: string; intervalMinutes: number } {
  if (typeof input?.focus !== "string" || !input.focus.trim() || input.focus.trim().length > 1000) throw new BadRequestException({ code: "INVALID_CHECKIN", message: "O foco deve ter de 1 a 1.000 caracteres." });
  if (!Number.isInteger(input.intervalMinutes) || Number(input.intervalMinutes) < MIN_CHECKIN_INTERVAL_MINUTES || Number(input.intervalMinutes) > MAX_CHECKIN_INTERVAL_MINUTES) throw new BadRequestException({ code: "INVALID_CHECKIN", message: "O intervalo deve ser de 60 a 1.440 minutos." });
  return { focus: input.focus.trim(), intervalMinutes: Number(input.intervalMinutes) };
}
export function parseSuggestions(text: string): Array<{ title: string; text: string; sourceLink?: string }> {
  try {
    const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (Array.isArray(parsed)) return parsed.slice(0, 5).flatMap((item) => item && typeof item === "object" && typeof item.title === "string" && typeof item.text === "string" ? [{ title: item.title, text: item.text, ...(typeof item.sourceLink === "string" ? { sourceLink: item.sourceLink } : {}) }] : []);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { suggestions?: unknown }).suggestions)) return parseSuggestions(JSON.stringify((parsed as { suggestions: unknown[] }).suggestions));
  } catch { /* A resposta em texto livre também pode declarar que não há novidades. */ }
  if (/\b(nada (novo|a dizer)|sem (novidades|algo novo)|nenhuma novidade)\b/i.test(text)) return [];
  const clean = text.trim();
  return clean ? [{ title: clean.split(/[.!?\n]/)[0]!.trim().slice(0, 120) || "Uma novidade para você", text: clean.slice(0, 4000) }] : [];
}
interface ClaimedCheckin extends CheckinRecord { claimToken: string; runsToday: number; runsDay: string | null }

@Injectable()
export class CheckinsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly database: DatabaseService, private readonly agents: AgentsService, private readonly permissions: AgentPermissionsService,
    private readonly providers: ProvidersService, private readonly tools: ToolsService, private readonly policies: AgentPolicyService,
    private readonly audit: AuditService, private readonly notifications: NotificationsService, @Optional() private readonly skills?: AgentSkillsService) {}
  onModuleInit(): void { void this.scheduleNextTick(); }
  onModuleDestroy(): void { if (this.timer) clearTimeout(this.timer); }

  async list(ownerId: string, agentId?: string): Promise<CheckinRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM checkins WHERE owner_id=$1 AND ($2::uuid IS NULL OR agent_id=$2) ORDER BY created_at DESC`, [ownerId, agentId ?? null]);
    return result.rows as CheckinRecord[];
  }
  async create(principal: Principal, agentId: string, input: { focus?: unknown; intervalMinutes?: unknown }): Promise<CheckinRecord> {
    const value = validateCheckinInput(input);
    await this.assertAccessibleAgent(principal, agentId);
    const client=await this.database.getPool().connect(); let record:CheckinRecord;
    try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[principal.id]); await this.assertActiveCapacity(principal.id,undefined,client);
      const result=await client.query(`INSERT INTO checkins(id,owner_id,agent_id,focus,interval_minutes,next_run_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLUMNS}`,[randomUUID(),principal.id,agentId,value.focus,value.intervalMinutes,this.nextRun(new Date(),value.intervalMinutes)]);
      record=result.rows[0] as CheckinRecord; await client.query("COMMIT");
    } catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;} finally{client.release();}
    await this.audit.record({ actor: principal.id, action: "checkin.created", subject: record.id, details: { agentId } }); await this.scheduleNextTick(); return record;
  }
  async update(principal: Principal, id: string, patch: { focus?: unknown; intervalMinutes?: unknown; enabled?: unknown }): Promise<CheckinRecord> {
    const old = await this.getOwned(principal.id, id);
    const focus = patch.focus === undefined ? old.focus : validateCheckinInput({ focus: patch.focus, intervalMinutes: old.intervalMinutes }).focus;
    const interval = patch.intervalMinutes === undefined ? old.intervalMinutes : validateCheckinInput({ focus, intervalMinutes: patch.intervalMinutes }).intervalMinutes;
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_CHECKIN", message: "Informe se o check-in deve ficar ativo ou pausado." });
    const enabled = patch.enabled === undefined ? old.enabled : patch.enabled as boolean;
    if (enabled) await this.assertAccessibleAgent(principal, old.agentId);
    const client=await this.database.getPool().connect(); let updated:CheckinRecord;
    try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[principal.id]); if(enabled) await this.assertActiveCapacity(principal.id,id,client);
    const result = await client.query(`UPDATE checkins SET focus=$3,interval_minutes=$4,enabled=$5,
      next_run_at=CASE WHEN $5 AND (NOT enabled OR interval_minutes<>$4) THEN $6 ELSE next_run_at END,
      failure_streak=CASE WHEN $5 AND NOT enabled THEN 0 ELSE failure_streak END,disabled_reason=CASE WHEN $5 THEN NULL ELSE disabled_reason END,updated_at=now()
      WHERE id=$1 AND owner_id=$2 RETURNING ${COLUMNS}`, [id, principal.id, focus, interval, enabled, this.nextRun(new Date(), interval)]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND); updated=result.rows[0] as CheckinRecord; await client.query("COMMIT");
    } catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;} finally{client.release();}
    const record=updated;
    await this.audit.record({ actor: principal.id, action: patch.enabled === undefined ? "checkin.updated" : enabled ? "checkin.enabled" : "checkin.disabled", subject: id, details: { intervalMinutes: interval } });
    await this.scheduleNextTick(); return record;
  }
  async remove(principal: Principal, id: string): Promise<void> {
    const result = await this.database.getPool().query("DELETE FROM checkins WHERE id=$1 AND owner_id=$2", [id, principal.id]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    await this.audit.record({ actor: principal.id, action: "checkin.removed", subject: id }); await this.scheduleNextTick();
  }
  async suggestions(ownerId: string): Promise<CheckinSuggestion[]> {
    const result = await this.database.getPool().query(`SELECT ${SUGGESTION_COLUMNS} FROM checkin_suggestions WHERE owner_id=$1 AND status='aberta' ORDER BY created_at DESC LIMIT 100`, [ownerId]);
    return result.rows as CheckinSuggestion[];
  }
  async hide(principal: Principal, id: string): Promise<void> {
    const result = await this.database.getPool().query("UPDATE checkin_suggestions SET status='ocultada' WHERE id=$1 AND owner_id=$2 AND status='aberta' RETURNING id", [id, principal.id]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    await this.audit.record({ actor: principal.id, action: "checkin.suggestion.hidden", subject: id });
  }
  async start(principal: Principal, id: string): Promise<{ conversationId: string }> {
    const pool = this.database.getPool(); const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT s.id,s.title,s.text,s.checkin_id,c.agent_id FROM checkin_suggestions s JOIN checkins c ON c.id=s.checkin_id WHERE s.id=$1 AND s.owner_id=$2 AND s.status='aberta' FOR UPDATE OF s", [id, principal.id]);
      if (!found.rowCount) {
        const prior = await client.query("SELECT conversation_id AS id FROM checkin_suggestions WHERE id=$1 AND owner_id=$2 AND status='iniciada'", [id, principal.id]);
        if (prior.rows[0]?.id) { await client.query("COMMIT"); return { conversationId: prior.rows[0].id as string }; }
        throw new NotFoundException(NOT_FOUND);
      }
      const row = found.rows[0] as { id: string; title: string; text: string; checkin_id: string; agent_id: string };
      await this.assertAccessibleAgent(principal, row.agent_id);
      const conversationId = randomUUID();
      await client.query(`INSERT INTO conversations(id,title,agent_id,conversation_type,owner_id) VALUES($1,$2,$3,'individual',$4)`, [conversationId, `Check-in: ${row.title}`.slice(0, 120), row.agent_id, principal.id]);
      await client.query(`INSERT INTO messages(id,conversation_id,role,content,agent_id) VALUES($1,$2,'assistant',$3,$4)`, [randomUUID(), conversationId, row.text, row.agent_id]);
      await client.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [conversationId]);
      await client.query("UPDATE checkin_suggestions SET status='iniciada',conversation_id=$3 WHERE id=$1 AND owner_id=$2", [id, principal.id, conversationId]);
      await client.query("COMMIT");
      await this.audit.record({ actor: principal.id, action: "checkin.suggestion.started", subject: id, details: { conversationId } });
      return { conversationId };
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }
  async suggestion(principal: Principal, id: string): Promise<{ suggestion: CheckinSuggestion; agentId: string }> {
    const result = await this.database.getPool().query(`SELECT s.id,s.owner_id AS "ownerId",s.checkin_id AS "checkinId",s.title,s.text,s.source_link AS "sourceLink",s.status,s.conversation_id AS "conversationId",s.created_at AS "createdAt",c.agent_id AS "agentId" FROM checkin_suggestions s JOIN checkins c ON c.id=s.checkin_id WHERE s.id=$1 AND s.owner_id=$2`, [id,principal.id]);
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
    const { agentId, ...suggestion } = result.rows[0] as CheckinSuggestion & { agentId: string };
    return { suggestion, agentId };
  }
  async runNow(principal: Principal, id: string): Promise<{ status: string; suggestions: number }> {
    const existing = await this.getOwned(principal.id,id);
    await this.assertAccessibleAgent(principal,existing.agentId);
    const now = new Date(); const token = randomUUID();
    const claim = await this.database.getPool().query(`UPDATE checkins SET claim_until=$3,claim_token=$2 WHERE id=$1 AND owner_id=$4 AND enabled=true AND (claim_until IS NULL OR claim_until<=$5) AND (last_run_at IS NULL OR last_run_at<=$6) RETURNING ${COLUMNS},runs_today AS "runsToday",runs_day AS "runsDay",claim_token AS "claimToken"`, [id,token,new Date(now.getTime()+CLAIM_LEASE_MS),principal.id,now,new Date(now.getTime()-60*60_000)]);
    if (!claim.rowCount) throw new BadRequestException({ code:"CHECKIN_NOT_READY", message:"Este check-in já foi executado na última hora, está pausado ou já está em execução." });
    const result = await this.executeClaimed(claim.rows[0] as ClaimedCheckin, now, true, principal.id);
    await this.scheduleNextTick(); return result;
  }
  async tick(now = new Date()): Promise<number> {
    if (!this.database.isReady()) return 0;
    const token = randomUUID();
    const due = await this.database.getPool().query(`WITH due AS (SELECT id FROM checkins WHERE enabled=true AND next_run_at<=$1 AND (claim_until IS NULL OR claim_until<=$1) ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 20)
      UPDATE checkins c SET claim_until=$2,claim_token=$3 FROM due WHERE c.id=due.id RETURNING c.id,c.owner_id AS "ownerId",c.agent_id AS "agentId",c.focus,c.interval_minutes AS "intervalMinutes",c.enabled,c.next_run_at AS "nextRunAt",c.last_run_at AS "lastRunAt",c.last_status AS "lastStatus",c.failure_streak AS "failureStreak",c.disabled_reason AS "disabledReason",c.created_at AS "createdAt",c.updated_at AS "updatedAt",c.claim_token AS "claimToken",c.runs_today AS "runsToday",c.runs_day AS "runsDay"`, [now, new Date(now.getTime() + CLAIM_LEASE_MS), token]);
    for (const row of due.rows as ClaimedCheckin[]) await this.executeClaimed(row, now, false).catch(() => this.recordFailure(row, now));
    await this.scheduleNextTick(); return due.rowCount ?? 0;
  }
  private async executeClaimed(row: ClaimedCheckin, now: Date, force: boolean, actor = "routine"): Promise<{ status: string; suggestions: number }> {
    const day = now.toISOString().slice(0, 10);
    const started = await this.database.getPool().query(`UPDATE checkins SET runs_today=CASE WHEN runs_day=$3::date THEN runs_today+1 ELSE 1 END,runs_day=$3::date
      WHERE id=$1 AND claim_token=$2 AND enabled=true AND (runs_day IS DISTINCT FROM $3::date OR runs_today<$4) RETURNING runs_today`, [row.id,row.claimToken,day,MAX_CHECKIN_RUNS_PER_DAY]);
    if (!started.rowCount) {
      await this.finish(row, now, "limite_diario", false, actor);
      if (force) throw new BadRequestException("Este check-in já executou seis vezes hoje.");
      return { status: "limite_diario", suggestions: 0 };
    }
    let status = "concluido", suggestions = 0;
    try {
      const agent = await this.agents.get(row.agentId); const access = await this.permissions.access(row.agentId, { ...DEFAULT_PRINCIPAL, id: row.ownerId });
      if (!agent || !agent.enabled || access === "none") throw new Error("O bot não está mais acessível ou está inativo.");
      const output = await this.executeTurn(row, agent);
      if (!output.trim() || /\b(nada (novo|a dizer)|sem (novidades|algo novo)|nenhuma novidade)\b/i.test(output)) status = NOTHING_NEW;
      else {
        const previous = await this.database.getPool().query(`SELECT title FROM checkin_suggestions WHERE owner_id=$1 AND status IN ('ocultada','iniciada') AND created_at>=now()-($2::text || ' days')::interval`, [row.ownerId, CHECKIN_HIDDEN_DAYS]);
        const keys = new Set((previous.rows as { title: string }[]).map((item) => titleKey(item.title)));
        for (const suggestion of parseSuggestions(output).slice(0, 5)) {
          if (!suggestion.title.trim() || !suggestion.text.trim() || suggestion.title.length > 120 || keys.has(titleKey(suggestion.title))) continue;
          const id = randomUUID();
          const sourceLink = suggestion.sourceLink && /^https?:\/\//i.test(suggestion.sourceLink) ? suggestion.sourceLink : null;
          await this.database.getPool().query("INSERT INTO checkin_suggestions(id,owner_id,checkin_id,title,text,source_link) VALUES($1,$2,$3,$4,$5,$6)", [id,row.ownerId,row.id,suggestion.title.trim(),suggestion.text.trim(),sourceLink]);
          await this.notifications.create({ owner: row.ownerId, kind: "checkin.message", title: suggestion.title, body: suggestion.text.slice(0, 500), details: { suggestionId: id } }).catch(() => undefined); suggestions++; keys.add(titleKey(suggestion.title));
        }
        if (!suggestions) status = NOTHING_NEW;
      }
    } catch { status = "falha"; }
    await this.finish(row, now, status, status === "falha", actor); return { status, suggestions };
  }
  private async executeTurn(row: ClaimedCheckin, agent: NonNullable<Awaited<ReturnType<AgentsService["get"]>>>): Promise<string> {
    const promptSkills = await this.skills?.loadPromptSkills(row.agentId).catch(() => []) ?? [];
    const history = await this.database.getPool().query(`SELECT title,text FROM checkin_suggestions WHERE owner_id=$1 AND checkin_id=$2 AND status IN ('ocultada','iniciada') AND created_at>=now()-interval '30 days' ORDER BY created_at DESC LIMIT 30`, [row.ownerId,row.id]);
    const messages: ProviderMessage[] = [{ role: "system", content: UNTRUSTED_GUIDANCE }];
    if (agent.instructions.trim()) messages.unshift({ role: "system", content: agent.instructions.trim() });
    const skillsPrompt = buildSkillsSystemMessage(promptSkills); if (skillsPrompt) messages.splice(agent.instructions.trim() ? 1 : 0,0,{ role: "system",content: skillsPrompt });
    const previous = (history.rows as { title: string; text: string }[]).map((item) => `- ${item.title}: ${item.text.slice(0, 300)}`).join("\n") || "Nenhuma sugestão ocultada ou iniciada nos últimos 30 dias.";
    messages.push({ role: "user", content: markUntrusted(`Faça um check-in proativo com este foco: ${row.focus}\n\nNão repita estas sugestões recentes:\n${previous}\n\nRetorne JSON: {"suggestions":[{"title":"até 120 caracteres","text":"mensagem para iniciar uma conversa","sourceLink":"URL opcional"}]}. Se não há novidade útil, responda exatamente: ${NOTHING_NEW}.`,"check-in focus and history") });
    const catalog = this.tools.catalog(); const granted = new Set([...agent.toolsAllowed,...promptSkills.flatMap((skill) => skill.tools)]);
    const candidates = catalog.filter((tool) => tool.risk === "read" && granted.has(tool.name));
    const decisions = new Map<string,"allow"|"ask"|"deny"|null>(); for (const tool of candidates) decisions.set(tool.name,await this.policies.decisionFor(row.agentId,tool.name));
    const effective = effectiveSkillTools(promptSkills,new Set(candidates.filter((tool) => decisions.get(tool.name) !== "deny").map((tool) => tool.name)));
    const allowed = candidates.filter((tool) => decisions.get(tool.name) !== "deny" && (agent.toolsAllowed.includes(tool.name) || effective.includes(tool.name)));
    const offered = allowed.map((tool): CompletionTool => ({ type:"function",function:{name:tool.name.replace(/\./g,"__"),description:tool.description,parameters:{type:"object",properties:tool.parameters?.properties ?? {},...(tool.parameters?.required?{required:tool.parameters.required}:{}),additionalProperties:true}} }));
    const names = new Map(allowed.map((tool) => [tool.name.replace(/\./g,"__"),tool])); const provider = agent.provider === "anthropic" ? "anthropic" as const : "openai" as const; let output = "";
    for (let iteration=0;iteration<=4;iteration++) {
      const response=await this.providers.stream({provider,...(agent.model?{model:agent.model}:{}),generationConfig:agent.generationConfig,messages,tools:offered}); const completion=await readTurn(response); output+=completion.content;
      if (!completion.toolCalls.length) return output;
      if (iteration===4) return output;
      messages.push({role:"assistant",content:completion.content||null,tool_calls:completion.toolCalls});
      for(const call of completion.toolCalls){const tool=names.get(call.function.name); if(!tool) { messages.push({role:"tool",tool_call_id:call.id,content:"Ferramenta indisponível para check-ins."}); continue; }
        if(tool.risk!=="read") { messages.push({role:"tool",tool_call_id:call.id,content:"Ferramentas que exigem aprovação não estão disponíveis em check-ins."}); continue; }
        let input:Record<string,unknown>; try {const parsed:unknown=JSON.parse(call.function.arguments||"{}");if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();input=parsed as Record<string,unknown>;}catch{messages.push({role:"tool",tool_call_id:call.id,content:"Argumentos inválidos."});continue;}
        const run=await this.tools.invoke(tool.name,input,`checkin:${row.id}`,row.agentId,row.ownerId); const clean=await this.tools.maskSecretText(JSON.stringify(run.output??null)); messages.push({role:"tool",tool_call_id:call.id,content:markUntrusted(clean,tool.name)});
      }
    }
    return output;
  }
  private async finish(row: ClaimedCheckin, now: Date, status: string, failed: boolean, actor = "routine"): Promise<void> {
    const disabled = failed && Number(row.failureStreak)+1>MAX_CHECKIN_FAILURE_STREAK;
    await this.database.getPool().query(`UPDATE checkins SET last_run_at=$3,last_status=$4,next_run_at=$5,failure_streak=CASE WHEN $6 THEN failure_streak+1 ELSE 0 END,enabled=CASE WHEN $6 AND failure_streak+1>$7 THEN false ELSE enabled END,disabled_reason=CASE WHEN $6 AND failure_streak+1>$7 THEN $8 ELSE NULL END,updated_at=now(),claim_until=NULL,claim_token=NULL WHERE id=$1 AND claim_token=$2`,[row.id,row.claimToken,now,status,this.nextRun(now,row.intervalMinutes),failed,MAX_CHECKIN_FAILURE_STREAK,`Desligado após mais de ${MAX_CHECKIN_FAILURE_STREAK} falhas seguidas.`]);
    await this.audit.record({actor,action:"checkin.run",subject:actor === "routine" ? `checkin:${row.id}` : row.id,details:{status,disabled}});
  }
  private async recordFailure(row: ClaimedCheckin, now: Date): Promise<void> { await this.finish(row,now,"falha",true); }
  private async assertAccessibleAgent(principal: Principal, agentId: string): Promise<void> { const access=await this.permissions.access(agentId,principal); if(access==="none") throw new BadRequestException({code:"INVALID_CHECKIN",message:"O bot selecionado não está acessível."}); }
  private async assertActiveCapacity(ownerId: string, exceptId?: string, executor: PoolClient | ReturnType<DatabaseService["getPool"]> = this.database.getPool()): Promise<void> { const result=await executor.query("SELECT count(*)::int AS count FROM checkins WHERE owner_id=$1 AND enabled=true AND ($2::uuid IS NULL OR id<>$2)",[ownerId,exceptId??null]); if(Number((result.rows[0] as {count:number}).count)>=MAX_ACTIVE_CHECKINS) throw new BadRequestException({code:"CHECKIN_LIMIT",message:`Você já tem ${MAX_ACTIVE_CHECKINS} check-ins ativos. Pause um antes de ativar outro.`}); }
  private async getOwned(ownerId:string,id:string):Promise<CheckinRecord>{const result=await this.database.getPool().query(`SELECT ${COLUMNS} FROM checkins WHERE id=$1 AND owner_id=$2`,[id,ownerId]);if(!result.rowCount)throw new NotFoundException(NOT_FOUND);return result.rows[0] as CheckinRecord;}
  private nextRun(now:Date,minutes:number):Date{return new Date(now.getTime()+minutes*60_000);}
  private async scheduleNextTick():Promise<void>{if(this.timer)clearTimeout(this.timer);this.timer=null;if(!this.database.isReady()){this.armTimer(TICK_MS);return;}try{const result=await this.database.getPool().query("SELECT min(next_run_at) AS next FROM checkins WHERE enabled=true");const next=(result.rows[0] as {next:Date|string|null}).next;if(next)this.armTimer(Math.max(0,new Date(next).getTime()-Date.now()));}catch{this.armTimer(TICK_MS);}}
  private armTimer(delay:number):void{this.timer=setTimeout(()=>void this.tick(),delay);this.timer.unref();}
}
async function readTurn(response:globalThis.Response):Promise<{content:string;toolCalls:ProviderToolCall[]}>{if(!response.body)throw new Error("O provedor não retornou dados.");const reader=response.body.getReader(),decoder=new TextDecoder(),calls=new Map<number,ProviderToolCall>();let pending="",content="";const parse=(line:string)=>{if(!line.startsWith("data:"))return;const payload=line.slice(5).trim();if(!payload||payload==="[DONE]")return;try{const event=JSON.parse(payload) as {choices?:{delta?:{content?:string|null;tool_calls?:{index:number;id?:string;function?:{name?:string;arguments?:string}}[]}}[]};const delta=event.choices?.[0]?.delta;if(typeof delta?.content==="string")content+=delta.content;for(const part of delta?.tool_calls??[]){const call=calls.get(part.index)??{id:"",type:"function" as const,function:{name:"",arguments:""}};if(part.id)call.id=part.id;if(part.function?.name)call.function.name+=part.function.name;if(part.function?.arguments)call.function.arguments+=part.function.arguments;calls.set(part.index,call);}}catch{/* evento SSE parcial */}};try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split("\n");pending=lines.pop()??"";for(const line of lines)parse(line.endsWith("\r")?line.slice(0,-1):line);}pending+=decoder.decode();if(pending)parse(pending);}finally{reader.releaseLock();}return{content,toolCalls:[...calls.values()]};}
