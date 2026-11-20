import { Pool } from "pg";

export const migrationId = "044-conversation-effort";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reasoning_effort text NULL`);
  await pool.query(`ALTER TABLE conversations ADD CONSTRAINT conversations_reasoning_effort_check CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('baixo','medio','alto'))`);
}
