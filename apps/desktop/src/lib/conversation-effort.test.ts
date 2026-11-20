import { describe, expect, it, vi } from "vitest";
import { ConversationEffortApi, effortLabel, isConversationEffort, shouldShowEffort } from "./conversation-effort";

describe("esforço por conversa", () => {
  it("mostra rótulos em pt-BR, visibilidade recebida do backend e valida níveis", () => {
    expect([null, "baixo", "medio", "alto"].map(effortLabel)).toEqual(["Padrão", "Baixo", "Médio", "Alto"]);
    expect(shouldShowEffort(true)).toBe(true);
    expect(shouldShowEffort(false)).toBe(false);
    expect(isConversationEffort("alto")).toBe(true);
    expect(isConversationEffort("extremo")).toBe(false);
  });
  it("persiste a escolha por conversa", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    await new ConversationEffortApi(fetcher, "/api/v1").set("conv", "alto");
    expect(fetcher).toHaveBeenCalledWith("/api/v1/conversations/conv/reasoning-effort", expect.objectContaining({ method: "PUT", body: JSON.stringify({ effort: "alto" }) }));
  });
});
