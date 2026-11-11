import { Pool } from "pg";

export const migrationId = "014-sign-in";

/**
 * Entrada com conta de provedor (Google, Microsoft, Okta). Cada pessoa é cadastrada com o e-mail
 * da conta; o login só funciona para e-mails já cadastrados e ativos. As sessões guardam só o hash.
 */
export async function up(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(lower(email)) WHERE email IS NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_flows (
    state text PRIMARY KEY,
    provider text NOT NULL,
    code_verifier text NOT NULL,
    nonce text NOT NULL,
    expires_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`);
}
