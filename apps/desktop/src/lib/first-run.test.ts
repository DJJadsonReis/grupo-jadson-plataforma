import { describe, expect, it, vi } from "vitest";
import { confirmPostgresInstall, createLocalApiToken, describeLocalServicesCommand, describePostgresInstallCommand, isPostgresUrl, isSha256, plainWindowsPath, shouldAskServicesConsent, summarizeProcessOutput } from "./first-run";

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

  it("asks until consent is explicitly true", () => {
    expect(shouldAskServicesConsent(undefined)).toBe(true);
    expect(shouldAskServicesConsent(false)).toBe(true);
    expect(shouldAskServicesConsent(true)).toBe(false);
  });

  it("summarizes captured output and includes stderr", () => {
    expect(summarizeProcessOutput("serviços iniciados", "aviso")).toContain("Avisos/erros:\naviso");
    expect(summarizeProcessOutput("x".repeat(30), "", 10)).toContain("saída resumida");
  });

  it("validates PostgreSQL archive hashes and describes the confirmed install", () => {
    const hash = "aB".repeat(32);
    expect(isSha256(hash)).toBe(true);
    expect(isSha256("a".repeat(63))).toBe(false);
    expect(isSha256(`${"a".repeat(63)}z`)).toBe(false);
    expect(describePostgresInstallCommand("scripts\\install-postgresql-portable.ps1", "T:\\project\\.cache\\downloads\\pg.zip", hash, "tools\\postgresql"))
      .toContain("-ExpectedSha256 " + hash + "\nDestino: tools\\postgresql");
  });

  it("normalizes verbatim Windows drive and UNC paths", () => {
    expect(plainWindowsPath("\\\\?\\C:\\data\\archive.zip")).toBe("C:\\data\\archive.zip");
    expect(plainWindowsPath("\\\\?\\UNC\\server\\share\\archive.zip")).toBe("\\\\server\\share\\archive.zip");
    expect(plainWindowsPath("C:\\data\\archive.zip")).toBe("C:\\data\\archive.zip");
  });

  it("does not invoke PostgreSQL installation when confirmation is canceled", async () => {
    const install = vi.fn(async () => "installed");
    await expect(confirmPostgresInstall(false, install)).resolves.toBeUndefined();
    expect(install).not.toHaveBeenCalled();
  });
});
