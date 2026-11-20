import { AuditService, configuredRetentionDays } from "./audit.service";

describe("sweep retention regression", () => {
  it.each(["automatic", "manual"]) ("preserves AUDIT_RETENTION_DAYS when the first %s sweep creates the row", async (kind) => {
    const previous = process.env.AUDIT_RETENTION_DAYS;
    process.env.AUDIT_RETENTION_DAYS = "30";
    let retentionDays: number | null | undefined;
    const persisted = { updatedAt: null, updatedBy: null, lastSweepAt: null, lastSweepDeleted: 0 };
    const query = jest.fn(async (sql: string, args?: unknown[]) => {
      if (sql.includes("SELECT retention_days")) {
        return retentionDays === undefined ? { rows: [], rowCount: 0 } : { rows: [{ ...persisted, retentionDays }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_settings")) {
        retentionDays = args?.[0] as number | null;
        return { rows: [], rowCount: 1 };
      }
      return sql.includes("SELECT pg_try_advisory") ? { rows: [{ acquired: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
    });
    const client = { query, release: jest.fn() };
    const service = new AuditService({ getPool: () => ({ query, connect: async () => client }) } as never);
    try {
      if (kind === "automatic") await (service as unknown as { runAutomaticSweep(): Promise<void> }).runAutomaticSweep();
      else await service.sweepConfiguredNow("admin");
      await expect(service.getRetentionSettings()).resolves.toMatchObject({ retentionDays: 30 });
    } finally {
      if (previous === undefined) delete process.env.AUDIT_RETENTION_DAYS; else process.env.AUDIT_RETENTION_DAYS = previous;
    }
  });

  it("keeps an admin configured NULL disabled during manual sweep", async () => {
    const previous = process.env.AUDIT_RETENTION_DAYS;
    process.env.AUDIT_RETENTION_DAYS = "30";
    let retentionDays: number | null = null;
    const query = jest.fn(async (sql: string, args?: unknown[]) => {
      if (sql.includes("SELECT retention_days")) return { rows: [{ retentionDays, updatedAt: null, updatedBy: "admin", lastSweepAt: null, lastSweepDeleted: null }], rowCount: 1 };
      if (sql.includes("INSERT INTO audit_settings")) retentionDays = args?.[0] as number | null;
      return sql.includes("SELECT pg_try_advisory") ? { rows: [{ acquired: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
    });
    const client = { query, release: jest.fn() };
    const service = new AuditService({ getPool: () => ({ query, connect: async () => client }) } as never);
    try {
      await expect(service.sweepConfiguredNow("admin")).resolves.toMatchObject({ deleted: 0 });
      expect(retentionDays).toBeNull();
      expect(query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM audit_events"))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AUDIT_RETENTION_DAYS; else process.env.AUDIT_RETENTION_DAYS = previous;
    }
  });
});

describe("retenção de auditoria", () => {
  it("só aceita configuração inteira positiva e mantém desativado por padrão", () => {
    expect(configuredRetentionDays(undefined)).toBeNull();
    expect(configuredRetentionDays("0")).toBeNull();
    expect(configuredRetentionDays("2.5")).toBeNull();
    expect(configuredRetentionDays("999999")).toBeNull();
    expect(configuredRetentionDays("90")).toBe(90);
    expect(configuredRetentionDays("3650")).toBe(3650);
    expect(configuredRetentionDays("3651")).toBeNull();
  });

  it("usa fallback de ambiente apenas quando não há configuração persistida", async () => {
    const previous = process.env.AUDIT_RETENTION_DAYS;
    process.env.AUDIT_RETENTION_DAYS = "30";
    const query = jest.fn(async (): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => ({ rows: [], rowCount: 0 }));
    const service = new AuditService({ getPool: () => ({ query }) } as never);
    await expect(service.getRetentionSettings()).resolves.toMatchObject({ retentionDays: 30, lastSweepAt: null });
    query.mockResolvedValueOnce({ rows: [{ retentionDays: 7, updatedAt: "hoje", updatedBy: "admin", lastSweepAt: null, lastSweepDeleted: null }], rowCount: 1 });
    await expect(service.getRetentionSettings()).resolves.toMatchObject({ retentionDays: 7 });
    if (previous === undefined) delete process.env.AUDIT_RETENTION_DAYS; else process.env.AUDIT_RETENTION_DAYS = previous;
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const noEnv = new AuditService({ getPool: () => ({ query }) } as never);
    await expect(noEnv.getRetentionSettings()).resolves.toMatchObject({ retentionDays: configuredRetentionDays(previous) });
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

  it("recusa a passagem manual concorrente e registra passagem concluída", async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ acquired: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query, release: jest.fn() };
    const locked = new AuditService({ getPool: () => ({ connect: async () => client }) } as never);
    await expect(locked.sweepConfiguredNow("admin")).rejects.toMatchObject({ status: 409 });
    expect(query).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("executa a passagem manual inteira na conexão bloqueada", async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ acquired: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query: clientQuery, release: jest.fn() };
    const settings = { retentionDays: 7, updatedAt: null, updatedBy: null, lastSweepAt: null, lastSweepDeleted: null };
    const poolQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [settings], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [settings], rowCount: 1 });
    const service = new AuditService({ getPool: () => ({ connect: async () => client, query: poolQuery }) } as never);
    await expect(service.sweepConfiguredNow("admin")).resolves.toMatchObject({ deleted: 0, settings });
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SELECT pg_try_advisory_xact_lock(4192011) AS acquired", expect.stringContaining("DELETE FROM audit_events"), expect.stringContaining("INSERT INTO audit_settings"), expect.stringContaining("INSERT INTO audit_events"), "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
