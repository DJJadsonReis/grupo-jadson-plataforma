import { Pool } from "pg";

export const migrationId = "005-audit-and-approvals";

/**
 * Trilha de auditoria (quem fez o quê e quando) e fila de aprovação humana para ações sensíveis.
 * Os detalhes gravados não incluem o conteúdo das mensagens, só metadados.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id uuid PRIMARY KEY,
    actor text NOT NULL DEFAULT 'system',
    action text NOT NULL,
    subject text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS approvals (
    id uuid PRIMARY KEY,
    action text NOT NULL,
    subject text,
    summary text NOT NULL DEFAULT '',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_by text NOT NULL DEFAULT 'system',
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status, created_at DESC)`);
}
