import { describe, expect, it } from "vitest";
import { auditErrorMessage, buildAuditQuery, validateAuditRange } from "./audit-filters";

describe("filtros de auditoria", () => {
  it("monta query codificada e cursor", () => {
    expect(buildAuditQuery({ action: "login user", actor: "Ana", from: "2026-01-01", to: "2026-02-01", limit: 25 }, "cursor+")).toBe("action=login+user&actor=Ana&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&limit=25&cursor=cursor%2B");
  });
  it("valida intervalo e traduz erros", () => {
    expect(validateAuditRange({ from: "2026-02-01", to: "2026-01-01" })).toContain("data inicial");
    expect(auditErrorMessage("INVALID_CURSOR")).toContain("Tente carregar novamente");
  });
});
