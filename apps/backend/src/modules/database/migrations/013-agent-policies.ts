import { Pool } from "pg";

export const migrationId = "013-agent-policies";

/**
 * Regra por agente e ferramenta: "allow" dispensa aprovação de ferramentas sensíveis,
 * "ask" mantém o fluxo normal (padrão quando não há regra) e "deny" recusa a chamada.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_policies (
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('allow','ask','deny')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, tool)
  )`);
}
