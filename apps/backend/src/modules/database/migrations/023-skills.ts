import { Pool } from "pg";

export const migrationId = "023-skills";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS skills (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    instructions text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_id, slug)
  )`);
}
