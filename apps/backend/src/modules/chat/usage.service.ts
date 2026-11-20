import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { estimateCostUsd } from "./model-prices";

export interface UsageRecord {
  conversationId?: string | null | undefined;
  agentId?: string | null | undefined;
  ownerId?: string | undefined;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

type UsageGroupRow = {
  groupId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  title?: string | null;
};

export interface UsageSummaryLine {
  agentId?: string | null;
  conversationId?: string | null;
  personId?: string;
  title?: string;
  totalTokens: number;
  calls: number;
  costUsd: number | null;
  callsWithoutPrice: number;
}

@Injectable()
export class UsageService {
  constructor(private readonly database: DatabaseService) {}

  async record(usage: UsageRecord): Promise<void> {
    const clean = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    await this.database.getPool().query(
      `INSERT INTO usage_events(id,conversation_id,agent_id,provider,model,prompt_tokens,completion_tokens,total_tokens,owner_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), usage.conversationId ?? null, usage.agentId ?? null, usage.provider, usage.model,
        clean(usage.promptTokens), clean(usage.completionTokens), clean(usage.totalTokens), usage.ownerId ?? "sistema"],
    );
  }

  /** Mantém a forma antiga para consumidores internos já existentes. */
  async summaryByAgent(sinceIso: string): Promise<{ agentId: string | null; totalTokens: number; calls: number }[]> {
    const result = await this.database.getPool().query(
      `SELECT agent_id AS "agentId", COALESCE(SUM(total_tokens),0)::int AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events WHERE created_at >= $1 GROUP BY agent_id ORDER BY "totalTokens" DESC`,
      [sinceIso],
    );
    return result.rows as { agentId: string | null; totalTokens: number; calls: number }[];
  }

  async summaryForOwner(ownerId: string | null, sinceIso: string): Promise<{
    byAgent: UsageSummaryLine[];
    byConversation: UsageSummaryLine[];
    byPerson?: UsageSummaryLine[];
  }> {
    const pool = this.database.getPool();
    const filter = ownerId === null ? "" : " AND u.owner_id = $2";
    const params = ownerId === null ? [sinceIso] : [sinceIso, ownerId];
    const agentRows = await pool.query(
      `SELECT u.agent_id AS "groupId", u.provider, u.model,
        SUM(u.prompt_tokens)::bigint AS "promptTokens", SUM(u.completion_tokens)::bigint AS "completionTokens",
        SUM(u.total_tokens)::bigint AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events u WHERE u.created_at >= $1${filter}
       GROUP BY u.agent_id, u.provider, u.model ORDER BY SUM(u.total_tokens) DESC`, params);
    const conversationRows = await pool.query(
      `SELECT u.conversation_id AS "groupId", COALESCE(c.title, 'Sem conversa') AS title, u.provider, u.model,
        SUM(u.prompt_tokens)::bigint AS "promptTokens", SUM(u.completion_tokens)::bigint AS "completionTokens",
        SUM(u.total_tokens)::bigint AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events u LEFT JOIN conversations c ON c.id = u.conversation_id
       WHERE u.created_at >= $1${filter}
       GROUP BY u.conversation_id, c.title, u.provider, u.model
       ORDER BY SUM(u.total_tokens) DESC LIMIT 20`, params);
    const byAgent = aggregateRows(agentRows.rows as UsageGroupRow[], "agent");
    const byConversation = aggregateRows(conversationRows.rows as UsageGroupRow[], "conversation");
    if (ownerId !== null) return { byAgent, byConversation };
    const personRows = await pool.query(
      `SELECT u.owner_id AS "groupId", u.provider, u.model,
        SUM(u.prompt_tokens)::bigint AS "promptTokens", SUM(u.completion_tokens)::bigint AS "completionTokens",
        SUM(u.total_tokens)::bigint AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events u WHERE u.created_at >= $1
       GROUP BY u.owner_id, u.provider, u.model ORDER BY SUM(u.total_tokens) DESC`, [sinceIso]);
    return { byAgent, byConversation, byPerson: aggregateRows(personRows.rows as UsageGroupRow[], "person") };
  }
}

function aggregateRows(rows: UsageGroupRow[], group: "agent" | "conversation" | "person"): UsageSummaryLine[] {
  const groups = new Map<string, UsageSummaryLine & { costs: number; pricedCalls: number }>();
  for (const row of rows) {
    const key = row.groupId ?? "__null__";
    let result = groups.get(key);
    if (!result) {
      result = {
        ...(group === "agent" ? { agentId: row.groupId } : {}),
        ...(group === "conversation" ? { conversationId: row.groupId, title: row.title ?? "Sem conversa" } : {}),
        ...(group === "person" ? { personId: row.groupId ?? "sistema" } : {}),
        totalTokens: 0, calls: 0, costUsd: null, callsWithoutPrice: 0, costs: 0, pricedCalls: 0,
      };
      groups.set(key, result);
    }
    const calls = Number(row.calls);
    result.totalTokens += Number(row.totalTokens);
    result.calls += calls;
    const cost = estimateCostUsd(row.provider, row.model, Number(row.promptTokens), Number(row.completionTokens));
    if (cost === null) result.callsWithoutPrice += calls;
    else { result.costs += cost; result.pricedCalls += calls; }
  }
  return [...groups.values()].map(({ costs, pricedCalls, ...line }) => ({ ...line, costUsd: pricedCalls ? costs : null }));
}
