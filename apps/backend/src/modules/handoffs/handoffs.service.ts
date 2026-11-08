import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AgentsService } from "../agents/agents.service";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";

export const MAX_HANDOFF_DEPTH = 3;

export interface Handoff {
  id: string;
  conversationId: string;
  fromAgentId: string | null;
  toAgentId: string | null;
  reason: string;
  depth: number;
  createdAt: string;
}

/** Profundidade da próxima delegação. Recusa quando passaria do limite. */
export function nextHandoffDepth(currentDepth: number, max = MAX_HANDOFF_DEPTH): number {
  const next = currentDepth + 1;
  if (next > max) throw new BadRequestException({ code: "HANDOFF_LIMIT", message: `Esta conversa já atingiu o limite de ${max} delegações.` });
  return next;
}

@Injectable()
export class HandoffsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly agents: AgentsService,
    private readonly audit: AuditService,
  ) {}

  async create(input: { conversationId: string; fromAgentId?: string | null; toAgentId: string; reason?: string }): Promise<Handoff> {
    if (!input.conversationId || !input.toAgentId) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa e o agente de destino." });
    const target = await this.agents.get(input.toAgentId);
    if (!target) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "O agente de destino não foi encontrado." });
    if (!target.enabled) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "O agente de destino está inativo." });
    if (input.fromAgentId && input.fromAgentId === input.toAgentId) {
      throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Um agente não pode delegar para ele mesmo." });
    }

    const depthResult = await this.database.getPool().query(
      `SELECT COALESCE(MAX(depth), 0)::int AS depth FROM handoffs WHERE conversation_id = $1`,
      [input.conversationId],
    );
    const depth = nextHandoffDepth(Number((depthResult.rows[0] as { depth: number }).depth));

    const result = await this.database.getPool().query(
      `INSERT INTO handoffs(id, conversation_id, from_agent_id, to_agent_id, reason, depth)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, conversation_id AS "conversationId", from_agent_id AS "fromAgentId", to_agent_id AS "toAgentId",
                 reason, depth, created_at AS "createdAt"`,
      [randomUUID(), input.conversationId, input.fromAgentId ?? null, input.toAgentId, (input.reason ?? "").trim().slice(0, 300), depth],
    );
    const handoff = result.rows[0] as Handoff;
    await this.audit.record({
      action: "handoff.created",
      subject: input.conversationId,
      details: { fromAgentId: handoff.fromAgentId, toAgentId: handoff.toAgentId, depth },
    });
    return handoff;
  }

  async listForConversation(conversationId: string): Promise<Handoff[]> {
    const result = await this.database.getPool().query(
      `SELECT id, conversation_id AS "conversationId", from_agent_id AS "fromAgentId", to_agent_id AS "toAgentId",
              reason, depth, created_at AS "createdAt"
       FROM handoffs WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [conversationId],
    );
    return result.rows as Handoff[];
  }
}
