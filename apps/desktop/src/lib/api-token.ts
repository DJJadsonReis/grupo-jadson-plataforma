export type ApiFailure = Error & { status?: number; code?: string };

export class BackendHealthError extends Error {
  constructor(readonly status: number) {
    super(`Backend health returned HTTP ${status}`);
    this.name = "BackendHealthError";
  }
}

export async function repairHealthAndRetry(
  check: () => Promise<Response>,
  repairSetup: () => Promise<unknown>,
  onUnauthorized?: () => void,
): Promise<Response> {
  const first = await check();
  if (first.status !== 401) return first;
  await repairSetup().catch(() => undefined);
  const retried = await check();
  if (retried.status === 401) onUnauthorized?.();
  return retried;
}

export function isTokenRejected(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as ApiFailure).status === 401 && (!("code" in error) || (error as ApiFailure).code === "UNAUTHORIZED");
}

export function shouldShowReconnectNotice(status: number | null, code?: string): boolean {
  return status === 401 && (code === undefined || code === "UNAUTHORIZED");
}

/** Executa a checagem agora e continua a cada intervalo até o componente desmontar. */
export function monitorBackendHealth<T>(check: () => Promise<T>, onResult?: (result: T) => void, intervalMs = 10_000): () => void {
  let active = true;
  let inFlight = false;
  const poll = async () => {
    if (!active || inFlight) return;
    inFlight = true;
    try { onResult?.(await check()); } catch { /* a próxima checagem ocorre no intervalo normal */ }
    finally { inFlight = false; }
  };
  void poll();
  const timer = globalThis.setInterval(() => { void poll(); }, intervalMs);
  return () => { active = false; globalThis.clearInterval(timer); };
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

/** Reenvia a chamada recusada depois de invalidar a credencial pessoal e reler a do sistema. */
export async function reconnectAndRetryRequest(
  retry: () => Promise<Response>,
  refreshSystemToken: () => Promise<unknown>,
  clearUserSession: () => void,
  repairSetup: () => Promise<unknown> = async () => undefined,
): Promise<Response> {
  clearUserSession();
  await repairSetup();
  await refreshSystemToken();
  return retry();
}
