import { Pool } from "pg";

export const migrationId = "019-notifications";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    owner text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('approval.pending','routine.failed','tool_limit.reached')),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS notifications_owner_unread_idx ON notifications(owner, created_at DESC) WHERE read_at IS NULL`);
}
