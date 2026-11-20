import { Pool } from "pg";
import { AuditService } from "./audit.service";
import { parseAuditFilters } from "./audit-events.query";
import { AuditController } from "./audit.controller";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const testDatabaseName = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, "")) : "";
if (databaseUrl && (!testDatabaseName || !/(?:^|[_-])test(?:$|[_-])/i.test(testDatabaseName))) {
  throw new Error("TEST_DATABASE_URL precisa apontar para uma base separada cujo nome contenha 'test'.");
}
const enabled = Boolean(databaseUrl);
describe("busca da auditoria com PostgreSQL", () => {
  (enabled ? it : it.skip)("combina filtros e percorre eventos com timestamps empatados sem duplicar", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const schema = `audit_search_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const isolated = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    try {
      await isolated.query("CREATE TABLE audit_events(id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, subject text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL)");
      const sameTime = "2026-03-01T12:00:00.123456Z";
      const rows = [
        ["00000000-0000-4000-8000-000000000001", "Ana", "login", sameTime],
        ["00000000-0000-4000-8000-000000000002", "Ana", "login", sameTime],
        ["00000000-0000-4000-8000-000000000003", "Ana", "login", sameTime],
        ["00000000-0000-4000-8000-000000000004", "Ana", "login", "2026-03-01T11:00:00.000Z"],
        ["00000000-0000-4000-8000-000000000005", "Ana", "login", "2026-03-01T10:00:00.000Z"],
        ["00000000-0000-4000-8000-000000000006", "Ana", "login", "2026-03-01T09:00:00.000Z"],
        ["00000000-0000-4000-8000-000000000007", "Ana", "login", "2026-03-01T08:00:00.000Z"],
      ] as const;
      for (const [id, actor, action, createdAt] of rows) await isolated.query("INSERT INTO audit_events(id,actor,action,created_at) VALUES($1,$2,$3,$4)", [id, actor, action, createdAt]);
      const service = new AuditService({ getPool: () => isolated } as never);
      const controller = new AuditController(service);
      const filters = parseAuditFilters({ action: "login", actor: "Ana", from: "2026-03-01T00:00:00Z", to: "2026-03-02T00:00:00Z", limit: "2" });
      const admin = { principal: { id: "pg-admin", name: "Admin", role: "admin" } };
      await expect(Promise.resolve().then(() => controller.events({}, { principal: { id: "pg-viewer", name: "Viewer", role: "viewer" } }))).rejects.toMatchObject({ status: 403 });
      const first = await controller.events({ ...filters }, admin);
      const second = await controller.events({ ...filters, cursor: first.nextCursor ?? undefined }, admin);
      const third = await controller.events({ ...filters, cursor: second.nextCursor ?? undefined }, admin);
      const ids = [...first.items, ...second.items, ...third.items].map((event) => event.id);
      expect(ids).toEqual(rows.map(([id]) => id).reverse());
      expect(third.nextCursor).toBeNull();
    } finally {
      await isolated.end();
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    }
  });
});
