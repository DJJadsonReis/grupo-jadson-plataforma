import { Pool } from "pg";

export const migrationId = "053-checkins";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS checkins (
    id uuid PRIMARY KEY, owner_id text NOT NULL, agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    focus varchar(1000) NOT NULL CHECK (length(btrim(focus)) BETWEEN 1 AND 1000),
    interval_minutes integer NOT NULL CHECK (interval_minutes BETWEEN 60 AND 1440), enabled boolean NOT NULL DEFAULT true,
    next_run_at timestamptz NOT NULL, last_run_at timestamptz, last_status text, failure_streak integer NOT NULL DEFAULT 0,
    disabled_reason text, claim_until timestamptz, claim_token uuid, runs_today integer NOT NULL DEFAULT 0,
    runs_day date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS checkins_due_idx ON checkins(next_run_at) WHERE enabled=true");
  await pool.query(`CREATE TABLE IF NOT EXISTS checkin_suggestions (
    id uuid PRIMARY KEY, owner_id text NOT NULL, checkin_id uuid NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    title varchar(120) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120), text text NOT NULL,
    source_link text, status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','ocultada','iniciada')),
    conversation_id uuid, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS checkin_suggestions_owner_title_idx ON checkin_suggestions(owner_id, lower(title))");
  await pool.query("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check");
  await pool.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    'approval.pending', 'routine.failed', 'tool_limit.reached', 'responsibility.result', 'responsibility.disabled',
    'human_support.requested', 'task.completed', 'task.failed', 'checkin.message'
  ))`);
}
