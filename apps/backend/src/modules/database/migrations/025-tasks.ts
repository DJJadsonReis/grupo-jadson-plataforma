import { Pool } from "pg";

export const migrationId = "025-tasks";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','concluida','arquivada')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS tasks_owner_status_idx ON tasks(owner_id, status)");
}
