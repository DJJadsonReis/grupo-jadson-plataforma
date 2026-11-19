import { AuditService, configuredRetentionDays } from "./audit.service";

describe("retenção de auditoria", () => {
  it("só aceita configuração inteira positiva e mantém desativado por padrão", () => {
    expect(configuredRetentionDays(undefined)).toBeNull();
    expect(configuredRetentionDays("0")).toBeNull();
    expect(configuredRetentionDays("2.5")).toBeNull();
    expect(configuredRetentionDays("999999")).toBeNull();
    expect(configuredRetentionDays("90")).toBe(90);
  });

  it("apaga em lotes limitados, sob advisory lock, preservando assuntos de aprovações pendentes", async () => {
    const statements: { sql: string; args: unknown[] }[] = [];
    const pool = { query: async (sql: string, args: unknown[]) => {
      statements.push({ sql, args });
      return { rows: [], rowCount: statements.length === 1 ? 2 : 0 };
    } };
    const service = new AuditService({ getPool: () => pool } as never);
    expect(await service.sweepOldEvents(30, 2, 4)).toBe(2);
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain("pg_try_advisory_xact_lock");
    expect(statements[0]?.sql).toContain("FOR UPDATE OF event SKIP LOCKED LIMIT $2");
    expect(statements[0]?.sql).toContain("approval.status = 'pending'");
    expect(statements[0]?.args).toEqual([30, 2]);
  });

  it("não executa SQL com retenção inválida", async () => {
    const query = jest.fn();
    const service = new AuditService({ getPool: () => ({ query }) } as never);
    expect(await service.sweepOldEvents(0)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
