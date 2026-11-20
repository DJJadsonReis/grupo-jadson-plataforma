import { Pool } from "pg";

export const migrationId = "030-mcp-servers";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS mcp_servers (
    id text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    command text NOT NULL,
    args jsonb NOT NULL DEFAULT '[]'::jsonb,
    env_secret text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'error' CHECK (status IN ('connected', 'error')),
    status_message text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
