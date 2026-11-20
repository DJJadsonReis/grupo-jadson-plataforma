import { describe, expect, it, vi } from "vitest";
import { monitorBackendHealth, reconnectAndRetryRequest, repairHealthAndRetry, requestWithTokenRefresh, shouldShowReconnectNotice } from "./api-token";

const invokeMock = vi.fn();

describe("reconexão do token local", () => {
  it("repara o setup e repete health antes de exibir o aviso após 401", async () => {
    const order: string[] = [];
    const check = vi.fn(async () => {
      order.push("health");
      return new Response(null, { status: 401 });
    });
    const repair = vi.fn(async () => { order.push("repair"); return { databaseUrlMissing: false }; });
    const restart = vi.fn(async () => { order.push("restart"); });
    const notice = vi.fn(() => { order.push("notice"); });

    const response = await repairHealthAndRetry(check, repair, restart, notice);

    expect(response.status).toBe(401);
    expect(order).toEqual(["health", "repair", "restart", "health", "notice"]);
    expect(check).toHaveBeenCalledTimes(2);
    expect(notice).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
  });

  it("não reinicia quando falta a URL do PostgreSQL", async () => {
    const check = vi.fn(async () => new Response(null, { status: 401 }));
    invokeMock.mockResolvedValueOnce({ databaseUrlMissing: true });
    const restart = vi.fn(() => invokeMock("restart_local_backend"));
    const statuses: unknown[] = [];
    const repair = () => invokeMock("ensure_desktop_setup");
    await repairHealthAndRetry(check, repair, restart, vi.fn(), (status) => statuses.push(status));
    expect(invokeMock).toHaveBeenCalledWith("ensure_desktop_setup");
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledOnce();
    expect(statuses).toEqual([{ databaseUrlMissing: true }]);
  });

  it("faz apenas um reinício quando health continua em 401", async () => {
    const check = vi.fn(async () => new Response(null, { status: 401 }));
    const restart = vi.fn();
    const statuses: unknown[] = [];
    await repairHealthAndRetry(check, async () => ({ databaseUrlMissing: false }), restart, vi.fn(), (status) => statuses.push(status));
    expect(restart).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toEqual({ databaseUrlMissing: false });
  });

  it("converte falha no reparo em estado de erro sem expor detalhes", async () => {
    const check = vi.fn(async () => new Response(null, { status: 401 }));
    const statuses: unknown[] = [];
    await repairHealthAndRetry(check, async () => { throw new Error("databaseUrl=postgres://secret"); }, vi.fn(), vi.fn(), (status, failed) => statuses.push([status, failed]));
    expect(statuses).toEqual([[null, true]]);
  });

  it("repara setup ausente sem URL e evita reinício", async () => {
    const check = vi.fn(async () => new Response(null, { status: 401 }));
    invokeMock.mockResolvedValueOnce({ databaseUrlMissing: true });
    const restart = vi.fn(() => invokeMock("restart_local_backend"));
    const onStatus = vi.fn();
    await repairHealthAndRetry(check, () => invokeMock("ensure_desktop_setup"), restart, vi.fn(), onStatus);
    expect(invokeMock).toHaveBeenCalledWith("ensure_desktop_setup");
    expect(restart).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith({ databaseUrlMissing: true }, false);
  });

  it("retoma a checagem de saúde a cada 10 segundos até o backend voltar", async () => {
    vi.useFakeTimers();
    const health = vi.fn(async (): Promise<number> => 0).mockResolvedValueOnce(401).mockResolvedValueOnce(200);
    const observedStatuses: number[] = [];
    const stop = monitorBackendHealth(health, (status) => observedStatuses.push(status));
    try {
      await vi.waitFor(() => expect(health).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(health).toHaveBeenCalledTimes(2);
      expect(observedStatuses).toEqual([401, 200]);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

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
    const repairSetup = vi.fn().mockResolvedValue(undefined);
    const retried = await reconnectAndRetryRequest(
      request,
      async () => { token = "token-do-sistema"; },
      clearSession,
      repairSetup,
    );
    expect(clearSession).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
    expect(repairSetup).toHaveBeenCalledOnce();
    expect(retried.status).toBe(200);
  });
});
