import { describe, expect, it, vi } from "vitest";
import { reconnectAndRetryRequest, requestWithTokenRefresh, shouldShowReconnectNotice } from "./api-token";

describe("reconexão do token local", () => {
  it("repete a chamada depois de reler o token e preserva o aviso se continuar em 401", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 401 }));
    const notice = vi.fn();
    const response = await requestWithTokenRefresh(request, notice);
    expect(request.mock.calls.map(([refresh]) => refresh)).toEqual([false, true]);
    expect(response.status).toBe(401);
    expect(notice).toHaveBeenCalledOnce();
    expect(shouldShowReconnectNotice(401, "UNAUTHORIZED")).toBe(true);
    expect(shouldShowReconnectNotice(403, "FORBIDDEN")).toBe(false);
  });

  it("não avisa quando a nova tentativa é aceita", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    const notice = vi.fn();
    const response = await requestWithTokenRefresh(request, notice);
    expect(response.status).toBe(200);
    expect(notice).not.toHaveBeenCalled();
  });

  it("não trata outro 401 como token local recusado", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ code: "LOGIN_REQUIRED" }, { status: 401 }));
    const notice = vi.fn();
    await requestWithTokenRefresh(request, notice);
    expect(request).toHaveBeenCalledOnce();
    expect(notice).not.toHaveBeenCalled();
  });

  it("reconecta após rejeição de sessão antiga e repete a mesma chamada com o token do sistema", async () => {
    let token = "sessao-antiga";
    const request = vi.fn(async () => token === "token-do-sistema" ? new Response("ok", { status: 200 }) : new Response(null, { status: 401 }));
    const first = await requestWithTokenRefresh(async (refresh) => {
      if (refresh) token = "sessao-antiga";
      return request();
    }, vi.fn());
    expect(first.status).toBe(401);
    const clearSession = vi.fn(() => { token = ""; });
    const retried = await reconnectAndRetryRequest(
      request,
      async () => { token = "token-do-sistema"; },
      clearSession,
    );
    expect(clearSession).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
    expect(retried.status).toBe(200);
  });
});
