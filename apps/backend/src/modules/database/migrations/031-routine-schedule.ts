import { Pool } from "pg";

export const migrationId = "031-routine-schedule";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE routines ADD COLUMN IF NOT EXISTS daily_at text NULL`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE routines ADD CONSTRAINT routines_daily_at_format
      CHECK (daily_at IS NULL OR daily_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
}
