import { describe, expect, it, vi } from "vitest";
import { checkFirstRunHealth } from "./first-run-health";

describe("checkFirstRunHealth", () => {
  it("envia o token local depois de 401 e aceita o health autenticado", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ dependencies: { postgres: "connected", pgvector: "connected", redis: "disconnected", queue: { driver: "memory", persistence: "process-memory" } } }));
    const getToken = vi.fn().mockResolvedValueOnce("token-inicial").mockResolvedValueOnce("token-corrigido");
    const repair = vi.fn().mockResolvedValue(undefined);

    const health = await checkFirstRunHealth("http://localhost/api/v1", fetchMock, getToken, repair);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer token-inicial");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe("Bearer token-corrigido");
    expect(repair).toHaveBeenCalledOnce();
    expect(health.postgres).toBe("connected");
  });
});
