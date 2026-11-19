import { Pool } from "pg";

export const migrationId = "017-user-preferences";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS user_preferences (
    owner text PRIMARY KEY,
    instructions text NOT NULL DEFAULT '',
    response_style text NOT NULL DEFAULT 'balanced' CHECK (response_style IN ('concise','balanced','detailed')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (char_length(instructions) <= 3000)
  )`);
}
