import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuditController } from "./audit.controller";

describe("rotas de eventos de auditoria", () => {
  const audit = { list: jest.fn(async () => [{ id: "1", actor: "Admin", action: "login" }]), search: jest.fn(async () => ({ items: [], nextCursor: null })) } as never;
  const controller = new AuditController(audit);
  const admin = { principal: { id: "1", name: "Admin", role: "admin" } };
  const viewer = { principal: { id: "2", name: "Viewer", role: "viewer" } };

  it("restringe as duas rotas a administradores", async () => {
    await expect(Promise.resolve().then(() => controller.list("30", viewer))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(Promise.resolve().then(() => controller.events({}, viewer))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(Promise.resolve().then(() => controller.list("30", admin))).resolves.toEqual([{ id: "1", actor: "Admin", action: "login" }]);
    await expect(Promise.resolve().then(() => controller.events({}, admin))).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("retorna erros de contrato para filtros inválidos", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ limit: "0" }, "INVALID_LIMIT"], [{ limit: "101" }, "INVALID_LIMIT"], [{ cursor: "adulterado" }, "INVALID_CURSOR"],
      [{ from: "2026-02-01", to: "2026-01-01" }, "INVALID_RANGE"], [{ from: "2026-99-99" }, "INVALID_DATE"],
    ];
    for (const [query, code] of cases) {
      const error = await Promise.resolve().then(() => controller.events(query, admin)).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code });
    }
  });
});
