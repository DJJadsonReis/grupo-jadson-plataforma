import { Pool } from "pg";

export const migrationId = "052-task-notification-kinds";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check`);
  await pool.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
    'approval.pending','routine.failed','tool_limit.reached','responsibility.result','responsibility.disabled',
    'human_support.requested','task.completed','task.failed'
  ))`);
}
