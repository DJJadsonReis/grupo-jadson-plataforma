import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { estimateCostUsd, ModelPriceMap } from "./model-prices";
import { AuditService } from "../audit/audit.service";

export interface ModelPrice { provider: string; model: string; inputUsdPerMillion: number; outputUsdPerMillion: number; updatedBy: string; updatedAt: Date }
export interface ModelWithoutPrice { provider: string; model: string; calls: number }

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
  constructor(private readonly database: DatabaseService, private readonly audit?: AuditService) {}

  async listPrices(): Promise<{ prices: ModelPrice[]; modelsWithoutPrice: ModelWithoutPrice[] }> {
    const pool = this.database.getPool();
    const [prices, missing] = await Promise.all([
      pool.query(`SELECT provider,model,input_usd_per_million AS "inputUsdPerMillion",output_usd_per_million AS "outputUsdPerMillion",updated_by AS "updatedBy",updated_at AS "updatedAt" FROM model_prices ORDER BY provider,model`),
      pool.query(`SELECT u.provider,u.model,COUNT(*)::int AS calls FROM usage_events u
        WHERE u.created_at >= now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM model_prices p WHERE p.provider=u.provider AND p.model=u.model)
        GROUP BY u.provider,u.model ORDER BY COUNT(*) DESC,u.provider,u.model`),
    ]);
    return { prices: prices.rows as ModelPrice[], modelsWithoutPrice: missing.rows as ModelWithoutPrice[] };
  }

  async setPrice(input: { provider: string; model: string; inputUsdPerMillion: number; outputUsdPerMillion: number }, updatedBy: string): Promise<ModelPrice> {
    const result = await this.database.getPool().query(`INSERT INTO model_prices(provider,model,input_usd_per_million,output_usd_per_million,updated_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,model) DO UPDATE SET input_usd_per_million=EXCLUDED.input_usd_per_million,
      output_usd_per_million=EXCLUDED.output_usd_per_million,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING provider,model,input_usd_per_million AS "inputUsdPerMillion",output_usd_per_million AS "outputUsdPerMillion",updated_by AS "updatedBy",updated_at AS "updatedAt"`,
    [input.provider, input.model, input.inputUsdPerMillion, input.outputUsdPerMillion, updatedBy]);
    await this.audit?.record({ actor: updatedBy, action: "model_price.set", subject: `${input.provider}:${input.model}`, details: input });
    return result.rows[0] as ModelPrice;
  }

  async removePrice(provider: string, model: string, actor: string): Promise<boolean> {
    const result = await this.database.getPool().query(`DELETE FROM model_prices WHERE provider=$1 AND model=$2
      RETURNING provider,model,input_usd_per_million AS "inputUsdPerMillion",output_usd_per_million AS "outputUsdPerMillion"`, [provider, model]);
    if (!result.rowCount) return false;
    const row = result.rows[0] as { provider: string; model: string; inputUsdPerMillion: number; outputUsdPerMillion: number };
    await this.audit?.record({ actor, action: "model_price.remove", subject: `${provider}:${model}`, details: row });
    return true;
  }

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
    const priceRows = await pool.query(`SELECT provider,model,input_usd_per_million AS input,output_usd_per_million AS output FROM model_prices`);
    const prices: ModelPriceMap = Object.fromEntries((priceRows.rows as { provider: string; model: string; input: string | number; output: string | number }[])
      .map((row) => [`${row.provider}:${row.model}`, { input: Number(row.input), output: Number(row.output) }]));
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
    const byAgent = aggregateRows(agentRows.rows as UsageGroupRow[], "agent", prices);
    const byConversation = aggregateRows(conversationRows.rows as UsageGroupRow[], "conversation", prices);
    if (ownerId !== null) return { byAgent, byConversation };
    const personRows = await pool.query(
      `SELECT u.owner_id AS "groupId", u.provider, u.model,
        SUM(u.prompt_tokens)::bigint AS "promptTokens", SUM(u.completion_tokens)::bigint AS "completionTokens",
        SUM(u.total_tokens)::bigint AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events u WHERE u.created_at >= $1
       GROUP BY u.owner_id, u.provider, u.model ORDER BY SUM(u.total_tokens) DESC`, [sinceIso]);
    return { byAgent, byConversation, byPerson: aggregateRows(personRows.rows as UsageGroupRow[], "person", prices) };
  }
}

function aggregateRows(rows: UsageGroupRow[], group: "agent" | "conversation" | "person", prices: ModelPriceMap): UsageSummaryLine[] {
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
    const cost = estimateCostUsd(prices, row.provider, row.model, Number(row.promptTokens), Number(row.completionTokens));
    if (cost === null) result.callsWithoutPrice += calls;
    else { result.costs += cost; result.pricedCalls += calls; }
  }
  return [...groups.values()].map(({ costs, pricedCalls, ...line }) => ({ ...line, costUsd: pricedCalls ? costs : null }));
}
