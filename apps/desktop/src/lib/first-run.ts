export function isPostgresUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") && Boolean(parsed.hostname) && parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

export function createLocalApiToken(randomValues: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  const bytes = randomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type FirstRunHealth = {
  postgres: "connected" | "unavailable";
  pgvector: "connected" | "unavailable";
  redis: "connected" | "unavailable";
  queue: { driver: string; persistence: string };
};

export function describeLocalServicesCommand(scriptPath: string, projectRoot: string): string {
  const normalizedScript = scriptPath.replaceAll("/", "\\");
  const normalizedRoot = projectRoot.replaceAll("/", "\\");
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${normalizedScript}"\nDiretório de trabalho: ${normalizedRoot}`;
}

export function shouldAskServicesConsent(consent: unknown): boolean {
  return consent !== true;
}

export function mergeServicesConsent<T extends Record<string, unknown>>(config: T): T & { servicesConsent: true } {
  return { ...config, servicesConsent: true };
}

export function summarizeProcessOutput(stdout: string, stderr: string, limit = 1200): string {
  const output = [stdout.trim(), stderr.trim() ? `Avisos/erros:\n${stderr.trim()}` : ""]
    .filter(Boolean)
    .join("\n\n");
  if (!output) return "O script terminou sem emitir saída.";
  return output.length > limit ? `${output.slice(0, limit)}\n… (saída resumida)` : output;
}
