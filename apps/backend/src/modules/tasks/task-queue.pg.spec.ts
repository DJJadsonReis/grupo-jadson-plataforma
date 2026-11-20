import { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { migrationId, up } from "../database/migrations/051-task-queue";
import { TaskQueueService } from "./task-queue.service";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
describe("fila de tarefas PostgreSQL", () => {
  (enabled ? it : it.skip)("aplica migração, recupera lease e reivindica concorrentemente por duas instâncias reais", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `task_queue_${Date.now()}`;
    const clients: PoolClient[] = [];
    const expiredId = randomUUID();
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      const setup = await pool.connect();
      try {
        await setup.query(`SET search_path TO ${schema}`);
        await setup.query("CREATE TABLE tasks(id uuid PRIMARY KEY, owner_id text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','concluida','arquivada')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())");
        await up(setup as unknown as Pool); await up(setup as unknown as Pool);
        expect(migrationId).toBe("051-task-queue");
        await expect(setup.query("INSERT INTO tasks(id,owner_id,title,status) VALUES(gen_random_uuid(),'p','t','inválida')")).rejects.toThrow();
        await setup.query("INSERT INTO tasks(id,owner_id,title,status,attempts,claim_until,claim_token,queued_at) VALUES($1,'p','expirada','em_andamento',1,now()-interval '1 minute',$2,now()),(gen_random_uuid(),'p','outra','na_fila',0,NULL,NULL,now())", [expiredId, randomUUID()]);
      } finally { setup.release(); }

      const dbFor = async () => {
        const client = await pool.connect(); clients.push(client);
        await client.query(`SET search_path TO ${schema}`);
        const scopedPool = { query: (sql: string, params?: unknown[]) => client.query(sql, params as never) };
        return { isReady: () => true, getPool: () => scopedPool };
      };
      const database1 = await dbFor(); const database2 = await dbFor();
      const makeQueue = (database: unknown) => new TaskQueueService(database as never, {} as never, {} as never, {} as never, {} as never, { create: async () => undefined } as never, {} as never);
      const firstQueue = makeQueue(database1); const secondQueue = makeQueue(database2);
      await firstQueue.recoverExpired(new Date());
      const recovered = await (database1.getPool() as { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }).query("SELECT status,claim_until,claim_token FROM tasks WHERE id=$1", [expiredId]);
      expect(recovered.rows[0]).toMatchObject({ status: "na_fila", claim_until: null, claim_token: null });

      const [first, second] = await Promise.all([firstQueue.claimDue(), secondQueue.claimDue()]);
      const ids = [...first, ...second].map((task) => task.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      expect(ids).toContain(expiredId);
    } finally {
      clients.forEach((client) => client.release());
      await pool.query("SELECT 1").catch(() => undefined);
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
      await pool.end();
    }
  });
});
