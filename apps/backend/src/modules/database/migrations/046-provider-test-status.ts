import { Pool } from "pg";

export const migrationId = "046-provider-test-status";

export async function up(pool: Pool): Promise<void> {
  await pool.query("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS last_test_status text NULL");
  await pool.query("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS last_test_at timestamptz NULL");
}
