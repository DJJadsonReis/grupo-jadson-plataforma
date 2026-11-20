import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Principal } from "../auth/users.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { AgentsService } from "../agents/agents.service";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";

export const MAX_HANDOFF_DEPTH = 3;
export interface Handoff { id: string; conversationId: string; fromAgentId: string | null; toAgentId: string | null; reason: string; depth: number; createdAt: string; context?: string; appliedAt?: string | null; }

export function nextHandoffDepth(currentDepth: number, max = MAX_HANDOFF_DEPTH): number {
  const next = currentDepth + 1;
  if (next > max) throw new BadRequestException({ code: "HANDOFF_LIMIT", message: `Esta conversa já atingiu o limite de ${max} delegações.` });
  return next;
}

export function buildHandoffContext(messages: Array<{ role: string; content: string }>, reason: string): string {
  const lines = messages.slice(-12).map((message) => `${message.role}: ${message.content.slice(0, 300)}`);
  if (reason.trim()) lines.push(`Motivo: ${reason.trim().slice(0, 300)}`);
  return lines.join("\n").slice(0, 4000);
}

@Injectable()
export class HandoffsService {
  constructor(private readonly database: DatabaseService, private readonly agents: AgentsService,
    private readonly audit: AuditService, private readonly permissions: AgentPermissionsService) {}

  private async assertOwner(conversationId: string, principal: Principal): Promise<void> {
    const result = await this.database.getPool().query("SELECT 1 FROM conversations WHERE id=$1 AND owner_id=$2", [conversationId, principal.id]);
    if (!result.rowCount) throw new NotFoundException("Conversa não encontrada.");
  }

  async create(input: { conversationId: string; fromAgentId?: string | null; toAgentId: string; reason?: string }, principal: Principal): Promise<Handoff> {
    if (!input.conversationId || !input.toAgentId) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa e o agente de destino." });
    await this.assertOwner(input.conversationId, principal);
    try { await this.permissions.assertCanUse(input.toAgentId, principal); }
    catch { throw new ForbiddenException({ code: "AGENT_NOT_ALLOWED", message: "Você não tem permissão para usar esse agente." }); }
    const target = await this.agents.get(input.toAgentId);
    if (!target) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "O agente de destino não foi encontrado." });
    if (!target.enabled) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "O agente de destino está inativo." });
    if (input.fromAgentId && input.fromAgentId === input.toAgentId) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Um agente não pode delegar para ele mesmo." });

    const pool = this.database.getPool();
    const reason = (input.reason ?? "").trim().slice(0, 300);
    const history = await pool.query(
      `SELECT role,content FROM (SELECT role,content,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 12) recent ORDER BY created_at ASC`,
      [input.conversationId],
    );
    const context = buildHandoffContext(history.rows as Array<{ role: string; content: string }>, reason);
    const depthResult = await pool.query(`SELECT COALESCE(MAX(depth),0)::int AS depth FROM handoffs WHERE conversation_id=$1`, [input.conversationId]);
    const depth = nextHandoffDepth(Number((depthResult.rows[0] as { depth: number }).depth));
    const fromAgent = input.fromAgentId ? await this.agents.get(input.fromAgentId) : null;
    const transition = `Conversa passada de ${fromAgent?.name ?? "Assistente Geral"} para ${target.name}${reason ? ` — ${reason}` : ""}`;
    const client = await pool.connect();
    let handoff: Handoff;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO handoffs(id,conversation_id,from_agent_id,to_agent_id,reason,depth,context) VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,conversation_id AS "conversationId",from_agent_id AS "fromAgentId",to_agent_id AS "toAgentId",reason,depth,created_at AS "createdAt",context,applied_at AS "appliedAt"`,
        [randomUUID(), input.conversationId, input.fromAgentId ?? null, input.toAgentId, reason, depth, context],
      );
      handoff = inserted.rows[0] as Handoff;
      await client.query("INSERT INTO messages(id,conversation_id,role,content,agent_id,attachments,mentions) VALUES($1,$2,'assistant',$3,$4,'[]','[]')",
        [randomUUID(), input.conversationId, transition, input.toAgentId]);
      await client.query("UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2", [input.conversationId, principal.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    await this.audit.record({ action: "handoff.created", subject: input.conversationId,
      details: { fromAgentId: handoff.fromAgentId, toAgentId: handoff.toAgentId, conversationId: input.conversationId, contextSize: context.length, depth } });
    return handoff;
  }

  async listForConversation(conversationId: string, principal: Principal): Promise<Handoff[]> {
    await this.assertOwner(conversationId, principal);
    const result = await this.database.getPool().query(
      `SELECT id,conversation_id AS "conversationId",from_agent_id AS "fromAgentId",to_agent_id AS "toAgentId",reason,depth,created_at AS "createdAt",context,applied_at AS "appliedAt"
       FROM handoffs WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 50`, [conversationId]);
    return result.rows as Handoff[];
  }

  async consumeContext(conversationId: string, agentId: string): Promise<string | null> {
    const result = await this.database.getPool().query(
      `UPDATE handoffs SET applied_at=now() WHERE id=(SELECT id FROM handoffs WHERE conversation_id=$1 AND to_agent_id=$2 AND applied_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING context`,
      [conversationId, agentId]);
    const context = (result.rows[0] as { context?: string } | undefined)?.context;
    return context ? `Contexto da delegação\n${context}` : null;
  }
}
