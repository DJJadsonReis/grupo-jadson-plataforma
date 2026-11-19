import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DesktopSetupConfig {
  databaseUrl: string;
  apiToken: string;
}

function configPath(env: NodeJS.ProcessEnv): string | null {
  const explicit = env.GJ_DESKTOP_SETUP_PATH?.trim();
  if (explicit) return explicit;
  const localAppData = env.LOCALAPPDATA?.trim();
  return localAppData ? join(localAppData, "GrupoJadson", "setup.json") : null;
}

export function readDesktopSetup(env: NodeJS.ProcessEnv = process.env): DesktopSetupConfig | null {
  const path = configPath(env);
  if (!path) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const databaseUrl = typeof record.databaseUrl === "string" ? record.databaseUrl.trim() : "";
    const apiToken = typeof record.apiToken === "string" ? record.apiToken.trim() : "";
    const parsed = new URL(databaseUrl);
    if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") || !parsed.hostname || !/^[a-f0-9]{64}$/i.test(apiToken)) return null;
    return { databaseUrl, apiToken };
  } catch {
    return null;
  }
}

/** Local first-run configuration is authoritative for this Windows desktop installation. */
export function applyDesktopSetup(env: NodeJS.ProcessEnv = process.env): boolean {
  const setup = readDesktopSetup(env);
  if (!setup) return false;
  env.DATABASE_URL = setup.databaseUrl;
  env.API_TOKEN = setup.apiToken;
  return true;
}
