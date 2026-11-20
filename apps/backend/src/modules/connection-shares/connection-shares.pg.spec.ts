import { Pool } from "pg";
import { up } from "../database/migrations/033-connection-shares";

describe("connection shares PostgreSQL integration", () => {
  const enabled = Boolean(process.env.TEST_DATABASE_URL);
  (enabled ? it : it.skip)("creates its table and enforces share constraints", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      await pool.query("CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY)");
      await pool.query("INSERT INTO users(id) VALUES($1),($2) ON CONFLICT DO NOTHING", ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
      await up(pool);
      const statusCheck = await pool.query("SELECT status FROM google_connection_shares WHERE false");
      expect(statusCheck.rowCount).toBe(0);
      await expect(pool.query("INSERT INTO google_connection_shares(owner_id,grantee_id,status) VALUES($1,$2,'pending')", ["11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"])).rejects.toThrow();
      await expect(pool.query("INSERT INTO google_connection_shares(owner_id,grantee_id,status) VALUES($1,$2,'denied')", ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"])).rejects.toThrow();
    } finally { await pool.end(); }
  });
});
