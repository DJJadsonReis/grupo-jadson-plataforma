import type { FirstRunHealth } from "./first-run";

type HealthResponse = {
  dependencies?: {
    postgres?: string;
    pgvector?: string;
    redis?: string;
    queue?: { driver?: string; persistence?: string };
  };
};

export async function checkFirstRunHealth(
  apiUrl: string,
  request: typeof fetch,
  getToken: () => Promise<string>,
  repairSetup: () => Promise<unknown>,
): Promise<FirstRunHealth> {
  const token = await getToken();
  const send = (authorization?: string) => {
    const headers = new Headers();
    if (authorization) headers.set("Authorization", `Bearer ${authorization}`);
    return request(`${apiUrl}/health`, { cache: "no-store", headers });
  };

  let response = await send(token);
  if (response.status === 401) {
    await repairSetup().catch(() => undefined);
    const refreshedToken = await getToken();
    response = await send(refreshedToken);
  }
  if (!response.ok) throw new Error("backend");

  const body = await response.json() as HealthResponse;
  return {
    postgres: body.dependencies?.postgres === "connected" ? "connected" : "unavailable",
    pgvector: body.dependencies?.pgvector === "connected" ? "connected" : "unavailable",
    redis: body.dependencies?.redis === "connected" ? "connected" : "unavailable",
    queue: {
      driver: body.dependencies?.queue?.driver ?? "memory",
      persistence: body.dependencies?.queue?.persistence ?? "process-memory",
    },
  };
}
