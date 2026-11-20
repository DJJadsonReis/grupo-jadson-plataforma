import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuditController } from "./audit.controller";

describe("configuração de retenção da auditoria", () => {
  const audit = {
    getRetentionSettings: jest.fn(async () => ({ retentionDays: null })),
    setRetentionDays: jest.fn(async (retentionDays: number | null) => ({ retentionDays })),
    sweepConfiguredNow: jest.fn(async () => ({ deleted: 0 })),
  } as never;
  const controller = new AuditController(audit);
  const admin = { principal: { id: "admin", name: "Admin", role: "admin" } };

  it("restringe leitura, alteração e limpeza a administradores", async () => {
    await expect(controller.retention({ principal: { id: "viewer", name: "Viewer", role: "viewer" } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.setRetention({ retentionDays: 90 }, { principal: { id: "operator", name: "Operador", role: "operator" } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.sweepNow({ principal: { id: "viewer", name: "Viewer", role: "viewer" } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.retention(admin)).resolves.toMatchObject({ retentionDays: null });
  });

  it.each([0, -1, 3651, 2.5, "abc", undefined])("rejeita valor inválido %p", async (retentionDays) => {
    await expect(controller.setRetention({ retentionDays }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("aceita desligar e prazo válido", async () => {
    await expect(controller.setRetention({ retentionDays: null }, admin)).resolves.toMatchObject({ retentionDays: null });
    await expect(controller.setRetention({ retentionDays: 90 }, admin)).resolves.toMatchObject({ retentionDays: 90 });
  });
});
