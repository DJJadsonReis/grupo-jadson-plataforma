import { describe, expect, it } from "vitest";
import { auditErrorMessage, buildAuditQuery, validateAuditRange } from "./audit-filters";

describe("filtros de auditoria", () => {
  const localStart = (year: number, month: number, day: number) => new Date(year, month - 1, day).toISOString();

  it("monta query codificada e cursor", () => {
    expect(buildAuditQuery({ action: "login user", actor: "Ana", from: "2026-01-01", to: "2026-02-01", limit: 25 }, "cursor+")).toBe(`action=login+user&actor=Ana&from=${encodeURIComponent(localStart(2026, 1, 1))}&to=${encodeURIComponent(localStart(2026, 2, 2))}&limit=25&cursor=cursor%2B`);
  });
  it("inclui o dia escolhido inteiro para from e to", () => {
    const query = new URLSearchParams(buildAuditQuery({ action: "", actor: "", from: "2026-11-20", to: "2026-11-20", limit: 50 }));
    expect(query.get("from")).toBe(localStart(2026, 11, 20));
    expect(query.get("to")).toBe(localStart(2026, 11, 21));
  });
  it("omite from e to vazios", () => {
    const query = new URLSearchParams(buildAuditQuery({ action: "", actor: "", from: "", to: "", limit: 50 }));
    expect(query.has("from")).toBe(false);
    expect(query.has("to")).toBe(false);
    expect(query.toString()).toBe("limit=50");
  });
  it("aceita datas iguais, recusa início posterior e traduz erros", () => {
    expect(validateAuditRange({ from: "2026-02-01", to: "2026-02-01" })).toBeNull();
    expect(validateAuditRange({ from: "2026-02-01", to: "2026-01-01" })).toContain("data inicial");
    expect(auditErrorMessage("INVALID_CURSOR")).toContain("Tente carregar novamente");
  });
});
