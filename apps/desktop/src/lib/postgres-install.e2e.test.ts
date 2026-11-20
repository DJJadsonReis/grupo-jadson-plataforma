import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plainWindowsPath } from "./first-run";

const execFileAsync = promisify(execFile);
const expectedHash = "a".repeat(64);

async function runInstaller(useVerbatimPath: boolean): Promise<{ exitCode: number; output: string; targetExists: boolean }> {
  const project = await mkdtemp(join(tmpdir(), "grupo-jadson-postgres-e2e-"));
  try {
    const scripts = join(project, "scripts");
    const downloads = join(project, ".cache", "downloads");
    const target = join(project, "tools", "postgresql");
    await mkdir(scripts, { recursive: true });
    await mkdir(downloads, { recursive: true });
    await mkdir(join(project, "tools"), { recursive: true });
    const archive = join(downloads, "fake.zip");
    await writeFile(archive, "not a real zip; the expected hash deliberately differs");
    const archiveArgument = useVerbatimPath ? plainWindowsPath(`\\\\?\\${archive}`) : archive;
    const sourceScript = join(process.cwd(), "..", "..", "scripts", "install-postgresql-portable.ps1");
    await writeFile(join(scripts, "install-postgresql-portable.ps1"), await readFile(sourceScript));
    const scriptPath = join(scripts, "install-postgresql-portable.ps1");
    let exitCode = 0;
    let output = "";
    try {
      const result = await execFileAsync("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
        "-ArchivePath", archiveArgument, "-ExpectedSha256", expectedHash,
      ], { cwd: project, windowsHide: true });
      output = `${result.stdout}\n${result.stderr}`;
    } catch (error) {
      const processError = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
      exitCode = typeof processError.code === "number" ? processError.code : 1;
      output = `${processError.stdout ?? ""}\n${processError.stderr ?? ""}`;
    }
    return { exitCode, output, targetExists: await import("node:fs/promises").then(({ access }) => access(target).then(() => true, () => false)) };
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

describe("PostgreSQL installer script integration", () => {
  it("rejects a mismatched hash for common and normalized verbatim paths without extracting", async () => {
    for (const useVerbatimPath of [false, true]) {
      const result = await runInstaller(useVerbatimPath);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain(`Esperado ${expectedHash}`);
      expect(result.output).toMatch(/obtido [A-Fa-f0-9]{64}/);
      expect(result.targetExists).toBe(false);
    }
  });
});
