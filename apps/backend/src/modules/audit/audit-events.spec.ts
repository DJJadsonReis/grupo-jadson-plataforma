import { AuditService } from "./audit.service";
import { parseAuditFilters } from "./audit-events.query";

describe("busca paginada da auditoria", () => {
  it("combina filtros em SQL parametrizado e limita por cursor", async () => {
    const query = jest.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const service = new AuditService({ getPool: () => ({ query }) } as never);
    const filters = parseAuditFilters({ action: "login", actor: "Ana", from: "2026-01-01", to: "2026-02-01", limit: "20" });
    await service.search(filters);
    expect(query.mock.calls[0]![0]).toContain("action = $1 AND actor = $2 AND created_at >= $3::timestamptz AND created_at < $4::timestamptz");
    expect(query.mock.calls[0]![0]).toContain("ORDER BY created_at DESC, id DESC LIMIT $5");
    expect(query.mock.calls[0]![1]).toEqual(["login", "Ana", "2026-01-01", "2026-02-01", 21]);
  });

  it.each([
    [{ limit: "0" }, "INVALID_LIMIT"], [{ limit: "101" }, "INVALID_LIMIT"], [{ cursor: "adulterado" }, "INVALID_CURSOR"],
    [{ from: "2026-02-01", to: "2026-01-01" }, "INVALID_RANGE"], [{ from: "ontem" }, "INVALID_DATE"],
  ])("rejeita filtros inválidos %p", (query, code) => {
    expect(() => parseAuditFilters(query)).toThrow(expect.objectContaining({ code }));
  });
});
