import { Pool } from "pg";

export const migrationId = "010-routines";

/** Rotinas: uma ferramenta de leitura executada a cada N minutos. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS routines (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    tool text NOT NULL,
    interval_minutes integer NOT NULL CHECK (interval_minutes BETWEEN 1 AND 1440),
    enabled boolean NOT NULL DEFAULT true,
    next_run_at timestamptz NOT NULL DEFAULT now(),
    last_run_at timestamptz,
    last_status text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS routines_due_idx ON routines(enabled, next_run_at)`);
}
