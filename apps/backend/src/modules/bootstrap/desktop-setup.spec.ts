import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDesktopSetup, readDesktopSetup } from "./desktop-setup";

describe("desktop first-run configuration", () => {
  let directory: string;
  let configPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "gj-desktop-setup-"));
    configPath = join(directory, "setup.json");
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("loads only a valid PostgreSQL URL and a 256-bit hex API token", () => {
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgres://user:pass@localhost/db", apiToken: "a".repeat(64) }));
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toEqual({
      databaseUrl: "postgres://user:pass@localhost/db",
      apiToken: "a".repeat(64),
    });
  });

  it("rejects malformed config, non-PostgreSQL URLs, and short tokens", () => {
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "https://example.test", apiToken: "a".repeat(64) }));
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toBeNull();
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgres://localhost/db", apiToken: "short" }));
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toBeNull();
    writeFileSync(configPath, "not json");
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toBeNull();
  });

  it("returns null for a token with 63 characters", () => {
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgres://localhost/db", apiToken: "a".repeat(63) }));
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toBeNull();
  });

  it("applies saved local setup values to the backend environment", () => {
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgresql://local/db", apiToken: "b".repeat(64) }));
    const env: NodeJS.ProcessEnv = { GJ_DESKTOP_SETUP_PATH: configPath, DATABASE_URL: "", API_TOKEN: "" };
    expect(applyDesktopSetup(env)).toBe(true);
    expect(env.DATABASE_URL).toBe("postgresql://local/db");
    expect(env.API_TOKEN).toBe("b".repeat(64));
  });

  it("keeps the saved desktop token authoritative over a stale process token", () => {
    const savedToken = "c".repeat(64);
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgresql://local/db", apiToken: savedToken }));
    const env: NodeJS.ProcessEnv = { GJ_DESKTOP_SETUP_PATH: configPath, DATABASE_URL: "postgresql://stale/db", API_TOKEN: "d".repeat(64) };
    expect(applyDesktopSetup(env)).toBe(true);
    expect(env.API_TOKEN).toBe(savedToken);
    expect(env.DATABASE_URL).toBe("postgresql://local/db");
  });

  it("uses the saved desktop token when the process has no API token", () => {
    const savedToken = "e".repeat(64);
    writeFileSync(configPath, JSON.stringify({ databaseUrl: "postgresql://local/db", apiToken: savedToken }));
    const env: NodeJS.ProcessEnv = { GJ_DESKTOP_SETUP_PATH: configPath };
    expect(applyDesktopSetup(env)).toBe(true);
    expect(env.API_TOKEN).toBe(savedToken);
  });

  it("does nothing when no desktop configuration path exists", () => {
    expect(applyDesktopSetup({})).toBe(false);
  });

  it("returns null when the configured file is absent", () => {
    expect(readDesktopSetup({ GJ_DESKTOP_SETUP_PATH: configPath })).toBeNull();
  });
});
