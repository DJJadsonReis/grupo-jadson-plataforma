import { Pool } from "pg";

export const migrationId = "008-users";

/**
 * Pessoas que acessam a API com token próprio. Só o hash do token é guardado; o token
 * em texto aparece uma única vez, na criação ou na troca.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    role text NOT NULL CHECK (role IN ('admin','operator','viewer')),
    token_hash text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
