import { Pool } from "pg";

export const migrationId = "033-connection-shares";

export async function up(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS google_connection_shares (
    owner_id uuid NOT NULL REFERENCES users(id),
    grantee_id uuid NOT NULL REFERENCES users(id),
    status text NOT NULL CHECK (status IN ('pending','approved')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    approved_by uuid NULL REFERENCES users(id),
    approved_at timestamptz NULL,
    PRIMARY KEY (owner_id, grantee_id),
    CHECK (owner_id <> grantee_id)
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS google_connection_shares_grantee_idx ON google_connection_shares(grantee_id, status)");
}
