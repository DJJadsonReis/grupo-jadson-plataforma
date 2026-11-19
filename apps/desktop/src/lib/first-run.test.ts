import { describe, expect, it } from "vitest";
import { createLocalApiToken, describeLocalServicesCommand, isPostgresUrl, mergeServicesConsent, shouldAskServicesConsent, summarizeProcessOutput } from "./first-run";

describe("first run setup helpers", () => {
  it("accepts PostgreSQL URLs and rejects other or incomplete URLs", () => {
    expect(isPostgresUrl("postgres://postgres@localhost:5432/grupo_jadson")).toBe(true);
    expect(isPostgresUrl("postgresql://localhost/database")).toBe(true);
    expect(isPostgresUrl("https://localhost/database")).toBe(false);
    expect(isPostgresUrl("postgres://localhost")).toBe(false);
    expect(isPostgresUrl("not a url")).toBe(false);
  });

  it("creates a 256-bit hex token using the system random source", () => {
    const token = createLocalApiToken((bytes) => { bytes.fill(0xab); return bytes; });
    expect(token).toBe("ab".repeat(32));
    expect(token).toHaveLength(64);
  });

  it("describes the exact PowerShell command and working directory", () => {
    expect(describeLocalServicesCommand("T:/projeto/scripts/start.ps1", "T:/projeto")).toBe(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "T:\\projeto\\scripts\\start.ps1"\nDiretório de trabalho: T:\\projeto',
    );
  });

  it("asks until consent is explicitly true and preserves existing setup fields", () => {
    expect(shouldAskServicesConsent(undefined)).toBe(true);
    expect(shouldAskServicesConsent(false)).toBe(true);
    expect(shouldAskServicesConsent(true)).toBe(false);
    expect(mergeServicesConsent({ databaseUrl: "postgres://local/db", apiToken: "abc" })).toEqual({
      databaseUrl: "postgres://local/db", apiToken: "abc", servicesConsent: true,
    });
  });

  it("summarizes captured output and includes stderr", () => {
    expect(summarizeProcessOutput("serviços iniciados", "aviso")).toContain("Avisos/erros:\naviso");
    expect(summarizeProcessOutput("x".repeat(30), "", 10)).toContain("saída resumida");
  });
});
