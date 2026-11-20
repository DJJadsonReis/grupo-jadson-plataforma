import { Pool } from "pg";

export const migrationId = "047-mcp-server-tokens";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS mcp_server_tokens (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NULL,
    revoked_at timestamptz NULL
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS mcp_server_tokens_owner_id_idx ON mcp_server_tokens(owner_id)");
}
