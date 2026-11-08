import { Pool } from "pg";

export const migrationId = "009-tool-runs";

/** Cada uso de uma ferramenta vira um registro: quem pediu, o que entrou, o que saiu e a aprovação. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS tool_runs (
    id uuid PRIMARY KEY,
    tool text NOT NULL,
    requested_by text NOT NULL DEFAULT 'sistema',
    status text NOT NULL CHECK (status IN ('done','pending_approval','approved_pending_run','rejected','failed')),
    input jsonb NOT NULL DEFAULT '{}'::jsonb,
    output jsonb,
    approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tool_runs_created_idx ON tool_runs(created_at DESC)`);
}
