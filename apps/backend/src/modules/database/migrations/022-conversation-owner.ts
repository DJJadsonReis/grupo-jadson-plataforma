import { Pool } from "pg";

export const migrationId = "022-conversation-owner";

/** Existing conversation history remains owned by the system principal. */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'sistema'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS conversations_owner_updated_idx ON conversations(owner_id,updated_at DESC)`);
}
