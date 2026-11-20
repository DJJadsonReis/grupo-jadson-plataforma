import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuditService, configuredRetentionDays } from "./audit.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("retenção de auditoria no PostgreSQL", () => {
  let database: DatabaseService;
  beforeAll(async () => { process.env.DATABASE_URL = databaseUrl; database = new DatabaseService(); await database.onModuleInit(); });
  afterAll(async () => { await database.onModuleDestroy(); });

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
