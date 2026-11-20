import { Pool } from "pg";

export const migrationId = "049-handoff-context";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS applied_at timestamptz NULL");
}
