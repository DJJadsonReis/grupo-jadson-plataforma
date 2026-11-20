import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DatabaseService } from "../database/database.service";
import { AuditService, configuredRetentionDays } from "./audit.service";
import { up as createAuditRetentionSetting } from "../database/migrations/048-audit-retention-setting";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("retenção de auditoria no PostgreSQL", () => {
  let database: DatabaseService;
  beforeAll(async () => { process.env.DATABASE_URL = databaseUrl; database = new DatabaseService(); await database.onModuleInit(); });
  afterAll(async () => { await database.onModuleDestroy(); });

  it("preserves the environment fallback across repeated sweeps when the settings row is first created", async () => {
    const schema = `audit_retention_fallback_${randomUUID().replace(/-/g, "")}`;
    const adminPool = database.getPool();
    const priorRetention = process.env.AUDIT_RETENTION_DAYS;
    let isolated: Pool | undefined;
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    process.env.AUDIT_RETENTION_DAYS = "30";
    try {
      isolated = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
      await isolated.query(`CREATE TABLE approvals(id uuid PRIMARY KEY, status text NOT NULL)`);
      await isolated.query(`CREATE TABLE audit_events(id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, subject text NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`);
      await createAuditRetentionSetting(isolated);
      const service = new AuditService({ getPool: () => isolated! } as never);
      const firstEvent = randomUUID();
      await isolated.query(`INSERT INTO audit_events(id,actor,action,created_at) VALUES($1,'pg-test','fallback.first',now()-interval '40 days')`, [firstEvent]);
      await expect(service.sweepConfiguredNow("pg-test")).resolves.toMatchObject({ deleted: 1, settings: { retentionDays: 30 } });
      expect((await isolated.query("SELECT retention_days FROM audit_settings WHERE id=1")).rows[0]?.retention_days).toBe(30);

      const secondEvent = randomUUID();
      await isolated.query(`INSERT INTO audit_events(id,actor,action,created_at) VALUES($1,'pg-test','fallback.second',now()-interval '40 days')`, [secondEvent]);
      await expect(service.sweepConfiguredNow("pg-test")).resolves.toMatchObject({ deleted: 1, settings: { retentionDays: 30 } });
      expect((await isolated.query("SELECT retention_days FROM audit_settings WHERE id=1")).rows[0]?.retention_days).toBe(30);
      expect((await isolated.query("SELECT id FROM audit_events WHERE id = ANY($1::uuid[])", [[firstEvent, secondEvent]])).rowCount).toBe(0);
    } finally {
      if (priorRetention === undefined) delete process.env.AUDIT_RETENTION_DAYS; else process.env.AUDIT_RETENTION_DAYS = priorRetention;
      await isolated?.end();
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });

  it("cria a tabela de configuração idempotentemente e persiste o singleton", async () => {
    const pool = database.getPool();
    await createAuditRetentionSetting(pool);
    await createAuditRetentionSetting(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO audit_settings(id,retention_days) VALUES(1,7) ON CONFLICT (id) DO UPDATE SET retention_days=EXCLUDED.retention_days");
      const row = await client.query("SELECT retention_days FROM audit_settings WHERE id=1");
      expect(row.rows[0]?.retention_days).toBe(7);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("passagem manual remove só eventos vencidos, registra o resultado e mantém aprovações e execuções", async () => {
    const schema = `audit_retention_test_${randomUUID().replace(/-/g, "")}`;
    const adminPool = database.getPool();
    let isolated: Pool | undefined;
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    try {
      isolated = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
      await isolated.query(`CREATE TABLE approvals(id uuid PRIMARY KEY, status text NOT NULL)`);
      await isolated.query(`CREATE TABLE tool_runs(id uuid PRIMARY KEY)`);
      await isolated.query(`CREATE TABLE audit_events(id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, subject text NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`);
      await createAuditRetentionSetting(isolated);
      const approvalId = randomUUID(); const toolRunId = randomUUID(); const oldId = randomUUID(); const pendingId = randomUUID();
      await isolated.query("INSERT INTO approvals(id,status) VALUES($1,'pending')", [approvalId]);
      await isolated.query("INSERT INTO tool_runs(id) VALUES($1)", [toolRunId]);
      await isolated.query(`INSERT INTO audit_events(id,actor,action,subject,created_at) VALUES
        ($1,'pg-test','old.event',NULL,now()-interval '40 days'),
        ($2,'pg-test','approval.requested',$3,now()-interval '40 days')`, [oldId, pendingId, approvalId]);
      await isolated.query("INSERT INTO audit_settings(id,retention_days) VALUES(1,30)");
      const result = await new AuditService({ getPool: () => isolated! } as never).sweepConfiguredNow("pg-test");
      expect(result.deleted).toBe(1);
      expect((await isolated.query("SELECT id FROM audit_events WHERE id=$1", [oldId])).rowCount).toBe(0);
      expect((await isolated.query("SELECT id FROM audit_events WHERE id=$1", [pendingId])).rowCount).toBe(1);
      expect((await isolated.query("SELECT id FROM approvals WHERE id=$1", [approvalId])).rowCount).toBe(1);
      expect((await isolated.query("SELECT id FROM tool_runs WHERE id=$1", [toolRunId])).rowCount).toBe(1);
      expect((await isolated.query("SELECT action FROM audit_events WHERE action='audit.retention.swept'")).rows).toHaveLength(1);
      expect((await isolated.query("SELECT last_sweep_deleted FROM audit_settings WHERE id=1")).rows[0]?.last_sweep_deleted).toBe(1);
    } finally {
      await isolated?.end();
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });

  it("apaga eventos antigos em lote, preserva aprovação pendente e não remove approvals/tool_runs", async () => {
    const pool = database.getPool();
    const approvalId = randomUUID();
    const pendingEventId = randomUUID();
    const oldEventId = randomUUID();
    const toolRunId = randomUUID();
    try {
      await pool.query(`INSERT INTO approvals(id,action,summary,status,requested_by) VALUES($1,'tool.test','Teste','pending','pg-test')`, [approvalId]);
      await pool.query(`INSERT INTO tool_runs(id,tool,status,approval_id) VALUES($1,'test.tool','pending_approval',$2)`, [toolRunId, approvalId]);
      await pool.query(`INSERT INTO audit_events(id,actor,action,subject,created_at) VALUES
        ($1,'pg-test','old.test',NULL,now()-interval '40 days'),
        ($2,'pg-test','approval.requested',$3,now()-interval '40 days')`, [oldEventId, pendingEventId, approvalId]);
      const deleted = await new AuditService(database).sweepOldEvents(30, 1, 10);
      expect(deleted).toBeGreaterThanOrEqual(1);
      const rows = await pool.query(`SELECT id FROM audit_events WHERE id = ANY($1::uuid[])`, [[oldEventId, pendingEventId]]);
      expect(rows.rows.map((row) => row.id)).toContain(pendingEventId);
      expect(rows.rows.map((row) => row.id)).not.toContain(oldEventId);
      expect((await pool.query(`SELECT id FROM approvals WHERE id=$1`, [approvalId])).rowCount).toBe(1);
      expect((await pool.query(`SELECT id FROM tool_runs WHERE id=$1`, [toolRunId])).rowCount).toBe(1);
    } finally {
      await pool.query(`DELETE FROM audit_events WHERE id = ANY($1::uuid[])`, [[oldEventId, pendingEventId]]);
      await pool.query(`DELETE FROM tool_runs WHERE id=$1`, [toolRunId]);
      await pool.query(`DELETE FROM approvals WHERE id=$1`, [approvalId]);
    }
  });

  it("não inicia limpeza automática se AUDIT_RETENTION_DAYS estiver ausente", async () => {
    const pool = database.getPool();
    const eventId = randomUUID();
    const prior = process.env.AUDIT_RETENTION_DAYS;
    delete process.env.AUDIT_RETENTION_DAYS;
    try {
      await pool.query(`INSERT INTO audit_events(id,actor,action,created_at) VALUES($1,'pg-test','retention.disabled',now()-interval '40 days')`, [eventId]);
      const service = new AuditService(database);
      service.onModuleInit();
      expect(configuredRetentionDays(process.env.AUDIT_RETENTION_DAYS)).toBeNull();
      expect((await pool.query(`SELECT id FROM audit_events WHERE id=$1`, [eventId])).rowCount).toBe(1);
      service.onModuleDestroy();
    } finally {
      if (prior !== undefined) process.env.AUDIT_RETENTION_DAYS = prior;
      await pool.query(`DELETE FROM audit_events WHERE id=$1`, [eventId]);
    }
  });
});
