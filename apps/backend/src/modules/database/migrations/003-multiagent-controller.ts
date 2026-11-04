import { Pool } from "pg";

export const migrationId = "003-multiagent-controller";

/** Additive schema for richer agent profiles, persistent groups and message attachments. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS specialties jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai',
    ADD COLUMN IF NOT EXISTS generation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS tools_allowed jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_groups (
    id uuid PRIMARY KEY, name text NOT NULL, avatar text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '', mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','mention','coordinated')),
    coordinator_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS group_participants (
    group_id uuid NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
    agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    participant_role text NOT NULL DEFAULT '', PRIMARY KEY(group_id, agent_id)
  )`);
  await pool.query(`ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES agent_groups(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS conversation_type text NOT NULL DEFAULT 'individual'`);
  await pool.query(`ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`CREATE INDEX IF NOT EXISTS conversations_group_updated_idx ON conversations(group_id, updated_at DESC)`);
}
