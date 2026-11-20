import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ToolsService } from "./tools.service";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("atendimento humano no PostgreSQL", () => {
  let database: DatabaseService;
  let notifications: NotificationsService;
  const adminId = randomUUID();
  const viewerId = randomUUID();
  const inactiveAdminId = randomUUID();
  const requesterId = randomUUID();
  let runId: string | undefined;
  let auditActor = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
    notifications = new NotificationsService(database);
    await database.getPool().query("INSERT INTO users(id,name,role,token_hash,active) VALUES($1,'Admin teste','admin',$1,true),($2,'Viewer teste','viewer',$2,true),($3,'Admin inativo teste','admin',$3,false)", [adminId, viewerId, inactiveAdminId]);
  });
  afterAll(async () => {
    const pool = database.getPool();
    if (runId) await pool.query("DELETE FROM tool_runs WHERE id=$1", [runId]);
    if (auditActor) await pool.query("DELETE FROM audit_events WHERE actor=$1 AND action='human_support.requested'", [auditActor]);
    await pool.query("DELETE FROM notifications WHERE owner=$1", [adminId]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[adminId, viewerId, inactiveAdminId]]);
    await database.onModuleDestroy();
  });

  it("notifica o administrador ativo, não o viewer, e persiste auditoria e detalhes do servidor", async () => {
    const audit = new AuditService(database);
    const tools = new ToolsService(
      database,
      { request: async () => ({ id: randomUUID() }), get: async () => ({ status: "approved" }) } as never,
      audit,
      {} as never,
      { catalog: () => [], find: () => undefined, call: async () => ({}) } as never,
      { secret: async () => undefined, secretValuesForMasking: async () => [] } as never,
      { decisionFor: async () => null } as never,
      {} as never,
      notifications,
    );
    auditActor = requesterId;
    const pending = await tools.invoke("atendimento.humano", { pessoaId: "spoofed", motivo: "Preciso de ajuda", conversaId: "conv-pg-53" }, requesterId, undefined, requesterId);
    runId = pending.id;
    expect(pending.status).toBe("pending_approval");
    expect(await notifications.listUnread(adminId)).toHaveLength(0);
    await tools.executeApproved(pending.id, adminId);
    const adminNotices = await notifications.listUnread(adminId);
    expect(adminNotices).toHaveLength(1);
    expect(adminNotices[0]).toMatchObject({ kind: "human_support.requested", title: "Atendimento humano solicitado", body: "Preciso de ajuda", details: { conversationId: "conv-pg-53", requestedBy: requesterId } });
    expect(await notifications.listUnread(viewerId)).toHaveLength(0);
    const event = await database.getPool().query("SELECT actor, subject FROM audit_events WHERE actor=$1 AND action='human_support.requested'", [requesterId]);
    expect(event.rows).toContainEqual({ actor: requesterId, subject: "conv-pg-53" });
  });
});
