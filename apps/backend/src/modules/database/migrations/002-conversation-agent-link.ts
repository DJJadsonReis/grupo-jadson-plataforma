import { Pool } from "pg";

export const migrationId = "002-conversation-agent-link";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS conversations_agent_updated_idx
    ON conversations(agent_id, updated_at DESC)`);
}
