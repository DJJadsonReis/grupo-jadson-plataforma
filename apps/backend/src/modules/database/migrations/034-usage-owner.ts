import { Pool } from "pg";

export const migrationId = "034-usage-owner";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'sistema'");
  await pool.query("CREATE INDEX IF NOT EXISTS usage_events_owner_idx ON usage_events(owner_id, created_at DESC)");
  await pool.query(`UPDATE usage_events u SET owner_id = c.owner_id
    FROM conversations c
    WHERE u.conversation_id = c.id AND u.owner_id = 'sistema' AND c.owner_id <> 'sistema'`);
}
