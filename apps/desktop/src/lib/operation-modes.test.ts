import { describe, expect, it, vi } from "vitest";
import { OperationModesApi, operationModeForShortcut, visibleOperationModes } from "./operation-modes";

describe("modos de operação no desktop", () => {
  it("mostra cinco opções para admin e quatro para usuário comum", () => {
    expect(visibleOperationModes(true)).toHaveLength(5);
    expect(visibleOperationModes(false)).toHaveLength(4);
  });
  it("grava o modo selecionado no servidor", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ mode: "manual", inherited: false }), { status: 200 }));
    const api = new OperationModesApi(fetcher, "/api/v1");
    await expect(api.set("conversation", "manual")).resolves.toEqual({ mode: "manual", inherited: false });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/conversations/conversation/operation-mode", expect.objectContaining({ method: "PUT" }));
  });

  it("mapeia atalhos apenas com Alt e não oferece atalho para Ignorar permissões", () => {
    expect(["1", "2", "3", "4"].map((key) => operationModeForShortcut(key, true))).toEqual(["automatico", "manual", "aceitar_edicoes", "planejamento"]);
    expect(operationModeForShortcut("1", false)).toBeUndefined();
    expect(operationModeForShortcut("5", true)).toBeUndefined();
    expect("shortcut" in visibleOperationModes(true).find((item) => item.value === "ignorar_permissoes")!).toBe(false);
  });
});
