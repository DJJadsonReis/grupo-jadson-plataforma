import { describe, expect, it, vi } from "vitest";
import { requestWithTokenRefresh, shouldShowReconnectNotice } from "./api-token";

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
});
