import { Pool } from "pg";

export const migrationId = "028-responsibilities";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS responsibilities (
    id uuid PRIMARY KEY,
    owner_id text NOT NULL,
    agent_id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    instructions text NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 2000),
    interval_minutes integer NOT NULL CHECK (interval_minutes BETWEEN 60 AND 1440),
    enabled boolean NOT NULL DEFAULT true,
    next_run_at timestamptz NOT NULL,
    last_run_at timestamptz,
    last_status text,
    failure_streak integer NOT NULL DEFAULT 0,
    runs_today integer NOT NULL DEFAULT 0,
    runs_day date,
    last_result text NOT NULL DEFAULT '',
    disabled_reason text,
    claim_until timestamptz,
    claim_token uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS responsibilities_owner_idx ON responsibilities(owner_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS responsibilities_due_idx ON responsibilities(next_run_at) WHERE enabled = true");
}
