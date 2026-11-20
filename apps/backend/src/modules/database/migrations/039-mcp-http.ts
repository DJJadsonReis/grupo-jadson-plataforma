import { Pool } from "pg";

export const migrationId = "039-mcp-http";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE mcp_servers
    ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'stdio',
    ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS headers_secret text NOT NULL DEFAULT ''`);
}
