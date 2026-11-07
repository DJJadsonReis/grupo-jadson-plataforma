import { Pool } from "pg";

export const migrationId = "004-usage-metering";

/** Additive table for token usage per provider call, used for cost control. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS usage_events (
    id uuid PRIMARY KEY,
    conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    provider text NOT NULL DEFAULT 'openai',
    model text NOT NULL DEFAULT '',
    prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS usage_events_agent_idx ON usage_events(agent_id, created_at DESC)`);
}
