import { Pool } from "pg";

export const migrationId = "050-agent-endpoint-protocol";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS endpoint_protocol text NOT NULL DEFAULT 'json' CHECK (endpoint_protocol IN ('json','agui'))`);
}
