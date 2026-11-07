import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface UsageRecord {
  conversationId?: string | null | undefined;
  agentId?: string | null | undefined;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

@Injectable()
export class UsageService {
  constructor(private readonly database: DatabaseService) {}

  /** Grava o consumo de uma chamada ao provedor. Valores não inteiros ou negativos viram zero. */
  async record(usage: UsageRecord): Promise<void> {
    const clean = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    await this.database.getPool().query(
      `INSERT INTO usage_events(id,conversation_id,agent_id,provider,model,prompt_tokens,completion_tokens,total_tokens)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), usage.conversationId ?? null, usage.agentId ?? null, usage.provider, usage.model,
        clean(usage.promptTokens), clean(usage.completionTokens), clean(usage.totalTokens)],
    );
  }

  /** Soma de tokens por agente desde uma data (ISO). */
  async summaryByAgent(sinceIso: string): Promise<{ agentId: string | null; totalTokens: number; calls: number }[]> {
    const result = await this.database.getPool().query(
      `SELECT agent_id AS "agentId", COALESCE(SUM(total_tokens),0)::int AS "totalTokens", COUNT(*)::int AS calls
       FROM usage_events WHERE created_at >= $1 GROUP BY agent_id ORDER BY "totalTokens" DESC`,
      [sinceIso],
    );
    return result.rows as { agentId: string | null; totalTokens: number; calls: number }[];
  }
}
