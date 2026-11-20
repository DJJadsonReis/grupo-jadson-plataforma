import { Pool } from "pg";

export const migrationId = "021-bot-sharing";

/** Existing profiles stay globally available under the system owner. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'sistema'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agents_owner_id_idx ON agents(owner_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS teams (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS teams_name_ci_idx ON teams(lower(name))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS team_members (
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_shares (
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('editor','user')),
    granted_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((user_id IS NOT NULL)::int + (team_id IS NOT NULL)::int = 1),
    UNIQUE (agent_id, user_id),
    UNIQUE (agent_id, team_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_shares_user_idx ON agent_shares(user_id) WHERE user_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_shares_team_idx ON agent_shares(team_id) WHERE team_id IS NOT NULL`);
}
