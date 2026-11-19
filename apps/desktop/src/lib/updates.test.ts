import { describe, expect, it, vi } from "vitest";
import { checkForDesktopUpdate } from "./updates";

describe("checkForDesktopUpdate", () => {
  it("retorna null fora do Tauri sem consultar o plugin", async () => {
    const checker = vi.fn();
    await expect(checkForDesktopUpdate(checker, false)).resolves.toEqual({ status: "unsupported" });
    expect(checker).not.toHaveBeenCalled();
  });

  it("retorna null quando o serviço configurado não anuncia uma versão nova", async () => {
    const checker = vi.fn(async () => null);
    await expect(checkForDesktopUpdate(checker, true)).resolves.toEqual({ status: "current" });
    expect(checker).toHaveBeenCalledOnce();
  });

  it("retorna a versão nova e libera o recurso do plugin", async () => {
    const close = vi.fn(async () => undefined);
    const downloadAndInstall = vi.fn(async () => undefined);
    const checker = vi.fn(async () => ({
      currentVersion: "0.1.0",
      version: "0.2.0",
      date: "2026-11-18T10:00:00Z",
      body: "Correções e melhorias",
      close,
      downloadAndInstall,
    } as never));

    const result = await checkForDesktopUpdate(checker, true);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("update expected");
    expect(result.notice).toEqual({
      currentVersion: "0.1.0",
      version: "0.2.0",
      date: "2026-11-18T10:00:00Z",
      notes: "Correções e melhorias",
      install: expect.any(Function),
      close: expect.any(Function),
    });
    expect(checker).toHaveBeenCalledWith({ timeout: 15_000 });
    await result.notice.install();
    await result.notice.close();
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("propaga erro do endpoint para a interface tratar", async () => {
    await expect(checkForDesktopUpdate(async () => { throw new Error("indisponível"); }, true)).rejects.toThrow("indisponível");
  });
});
