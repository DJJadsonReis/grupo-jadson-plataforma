import { Pool } from "pg";

export const migrationId = "024-agent-skills";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    owner_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, skill_id)
  )`);
}
