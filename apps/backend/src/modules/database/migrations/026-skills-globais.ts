import { Pool } from "pg";

export const migrationId = "026-skills-globais";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE skills ADD COLUMN IF NOT EXISTS global boolean NOT NULL DEFAULT false");
}
