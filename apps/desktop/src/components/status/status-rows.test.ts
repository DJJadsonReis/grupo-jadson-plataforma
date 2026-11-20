import { describe, expect, it } from "vitest";
import { toStatusRows, type HealthResponse } from "./status-rows";

const healthy: HealthResponse = {
  status: "ok", timestamp: "2026-11-20T12:00:00.000Z",
  dependencies: { postgres: "connected", pgvector: "connected", redis: "connected", queue: { driver: "redis", persistence: "redis-configuration-dependent" } },
};

describe("toStatusRows", () => {
  it("mantém as cinco dependências na ordem definida e reconhece estado saudável", () => {
    const rows = toStatusRows(healthy);
    expect(rows.map(({ label }) => label)).toEqual(["Backend", "PostgreSQL", "pgvector", "Redis", "Fila"]);
    expect(rows.map(({ state }) => state)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(rows[4]?.guidance).toContain("redis-configuration-dependent");
  });

  it("marca dependências indisponíveis sem expor valores secretos", () => {
    const rows = toStatusRows({ ...healthy, dependencies: { ...healthy.dependencies, postgres: "unavailable" } });
    expect(rows[1]).toMatchObject({ state: "indisponível", guidance: "Verifique a conexão PostgreSQL configurada para o backend." });
    expect(rows[1]?.guidance).not.toMatch(/postgres(?:ql)?:\/\/|token|secret/i);
  });

  it("trata configuração parcial como desconhecida", () => {
    expect(toStatusRows({ status: "ok" }).map(({ state }) => state)).toEqual(["ok", "desconhecido", "desconhecido", "desconhecido", "desconhecido"]);
  });

  it("não marca Redis como erro quando a fila usa memória de processo", () => {
    const rows = toStatusRows({ ...healthy, dependencies: { ...healthy.dependencies, redis: "unavailable", queue: { driver: "process-memory", persistence: "process-memory" } } });
    expect(rows[3]).toMatchObject({ state: "desconhecido", guidance: "Não usado nesta configuração." });
    expect(rows[4]?.guidance).toContain("process-memory");
  });

  it("representa falha de comunicação com backend indisponível e demais estados desconhecidos", () => {
    const rows = toStatusRows(null);
    expect(rows.map(({ state }) => state)).toEqual(["indisponível", "desconhecido", "desconhecido", "desconhecido", "desconhecido"]);
    expect(rows[0]?.guidance).toContain("assistente de primeira execução");
  });
});
