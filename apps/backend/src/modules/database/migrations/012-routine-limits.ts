import { Pool } from "pg";

export const migrationId = "012-routine-limits";

/**
 * Limites de rotinas: intervalo mínimo de 15 minutos e contador de falhas seguidas
 * (a rotina é desligada ao atingir o limite). Rotinas com intervalo menor são elevadas a 15.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`UPDATE routines SET interval_minutes = 15 WHERE interval_minutes < 15`);
  await pool.query(`ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_interval_minutes_check`);
  await pool.query(`ALTER TABLE routines ADD CONSTRAINT routines_interval_minutes_check CHECK (interval_minutes BETWEEN 15 AND 1440)`);
  await pool.query(`ALTER TABLE routines ADD COLUMN IF NOT EXISTS failure_streak integer NOT NULL DEFAULT 0`);
}
