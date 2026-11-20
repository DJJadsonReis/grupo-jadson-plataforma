import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { migrationId, up } from "../database/migrations/051-task-queue";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe("fila de tarefas PostgreSQL", () => {
  (enabled ? it : it.skip)("aplica migração idempotente, CHECK e claim concorrente", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `task_queue_${Date.now()}`;
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`SET search_path TO ${schema}`);
      await pool.query("CREATE TABLE tasks(id uuid PRIMARY KEY, owner_id text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','concluida','arquivada')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())");
      await up(pool); await up(pool);
      expect(migrationId).toBe("051-task-queue");
      await expect(pool.query("INSERT INTO tasks(id,owner_id,title,status) VALUES(gen_random_uuid(),'p','t','inválida')")).rejects.toThrow();
      await pool.query("INSERT INTO tasks(id,owner_id,title,status,queued_at) VALUES(gen_random_uuid(),'p','t','na_fila',now()),(gen_random_uuid(),'p','t2','na_fila',now())");
      const clients = [await pool.connect(), await pool.connect()];
      try {
        await Promise.all(clients.map((client) => client.query("BEGIN")));
        const claim = (client: typeof clients[number]) => client.query(`UPDATE tasks SET status='em_andamento',claim_until=now()+interval '5 minutes',claim_token=$1 WHERE id IN (SELECT id FROM tasks WHERE status='na_fila' ORDER BY queued_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`, [randomUUID()]);
        const results = await Promise.all(clients.map((client) => claim(client)));
        const first = results[0]!;
        const second = results[1]!;
        const ids = [...first.rows, ...second.rows].map((row) => row.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        await Promise.all(clients.map((client) => client.query("COMMIT")));
      } finally { clients.forEach((client) => client.release()); }
    } finally {
      await pool.query("RESET search_path").catch(() => undefined);
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
      await pool.end();
    }
  });
});
