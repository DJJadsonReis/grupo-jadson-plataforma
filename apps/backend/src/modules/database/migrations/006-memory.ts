import { Pool } from "pg";

export const migrationId = "006-memory";

/**
 * Memória de longo prazo por pessoa, com opt-out. Só o que a pessoa salva explicitamente
 * entra aqui; o texto nunca é gravado sem uma ação dela.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS memories (
    id uuid PRIMARY KEY,
    owner text NOT NULL DEFAULT 'local',
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS memories_owner_idx ON memories(owner, created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS memory_preferences (
    owner text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
