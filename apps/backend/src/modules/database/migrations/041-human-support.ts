import { Pool } from "pg";

export const migrationId = "041-human-support";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS human_support_requests (
    id uuid PRIMARY KEY, conversation_id text, agent_id text, requested_by text NOT NULL,
    reason text NOT NULL, status text NOT NULL CHECK (status IN ('aberto','assumido','resolvido')),
    claimed_by text, created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, resolved_at timestamptz
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS human_support_requests_status_created_idx ON human_support_requests(status,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS human_support_attendants (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
