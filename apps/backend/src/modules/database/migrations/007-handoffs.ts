import { Pool } from "pg";

export const migrationId = "007-handoffs";

/**
 * Delegação entre agentes dentro de uma conversa. `depth` conta quantas delegações já
 * encadearam a partir da primeira, para que o limite seja aplicado sem depender de memória.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS handoffs (
    id uuid PRIMARY KEY,
    conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
    from_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    to_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    reason text NOT NULL DEFAULT '',
    depth integer NOT NULL CHECK (depth >= 1),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS handoffs_conversation_idx ON handoffs(conversation_id, created_at DESC)`);
}
