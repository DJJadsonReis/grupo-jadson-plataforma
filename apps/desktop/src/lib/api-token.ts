export type ApiFailure = Error & { status?: number; code?: string };

export function isTokenRejected(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as ApiFailure).status === 401 && (!("code" in error) || (error as ApiFailure).code === "UNAUTHORIZED");
}

export function shouldShowReconnectNotice(status: number | null, code?: string): boolean {
  return status === 401 && (code === undefined || code === "UNAUTHORIZED");
}

export async function requestWithTokenRefresh(
  request: (refresh: boolean) => Promise<Response>,
  onUnauthorized: () => void,
): Promise<Response> {
  const first = await request(false);
  if (first.status !== 401) return first;
  try {
    const body = await first.clone().json() as { code?: unknown };
    if (typeof body.code === "string" && body.code !== "UNAUTHORIZED") return first;
  } catch { /* resposta sem corpo estruturado: mantém compatibilidade com servidores locais antigos */ }
  const retried = await request(true);
  if (retried.status === 401) onUnauthorized();
  return retried;
}
