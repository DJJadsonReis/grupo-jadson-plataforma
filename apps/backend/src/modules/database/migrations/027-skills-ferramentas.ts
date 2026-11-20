import { Pool } from "pg";

export const migrationId = "027-skills-ferramentas";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE skills ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}'");
}
