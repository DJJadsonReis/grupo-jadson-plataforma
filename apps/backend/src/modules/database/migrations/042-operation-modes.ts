import { Pool } from "pg";

export const migrationId = "042-operation-modes";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS operation_mode text NULL`);
  await pool.query(`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_operation_mode_check`);
  await pool.query(`ALTER TABLE conversations ADD CONSTRAINT conversations_operation_mode_check CHECK (operation_mode IS NULL OR operation_mode IN ('automatico','manual','aceitar_edicoes','planejamento','ignorar_permissoes'))`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_operation_mode text NOT NULL DEFAULT 'automatico'`);
  await pool.query(`ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_default_operation_mode_check`);
  await pool.query(`ALTER TABLE agents ADD CONSTRAINT agents_default_operation_mode_check CHECK (default_operation_mode IN ('automatico','manual','aceitar_edicoes','planejamento','ignorar_permissoes'))`);
}
