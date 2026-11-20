import { Pool } from "pg";

export const migrationId = "051-task-queue";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS agent_id uuid NULL,
    ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claim_until timestamptz NULL,
    ADD COLUMN IF NOT EXISTS claim_token uuid NULL,
    ADD COLUMN IF NOT EXISTS failure_message text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS queued_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL`);
  await pool.query(`DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT conname FROM pg_constraint
      WHERE conrelid='tasks'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', item.conname); END LOOP;
    ALTER TABLE tasks ADD CONSTRAINT tasks_queue_status_check
      CHECK (status IN ('aberta','concluida','arquivada','na_fila','em_andamento','falhou'));
  END $$`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tasks_queue_idx ON tasks(status, claim_until)`);
}
