import { Pool } from "pg";

export const migrationId = "048-audit-retention-setting";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    retention_days integer NULL CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NULL,
    last_sweep_at timestamptz NULL,
    last_sweep_deleted integer NULL CHECK (last_sweep_deleted IS NULL OR last_sweep_deleted >= 0)
  )`);
}
