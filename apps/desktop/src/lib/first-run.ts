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
