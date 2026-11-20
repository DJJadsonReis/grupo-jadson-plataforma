import { describe, expect, it } from "vitest";
import { providerLastTestLabel, providerModelCountLabel, providerStatusLabel, providerStatusTone } from "./provider-status";

describe("provider status presentation", () => {
  it.each([["nao_testada", "Não testada"], ["valida", "Válida"], ["sem_modelos", "Sem modelos"], ["invalida", "Inválida"], ["limite_atingido", "Limite atingido"], ["erro", "Erro"]] as const)("labels %s in Portuguese", (status, label) => expect(providerStatusLabel(status)).toBe(label));
  it("uses status tones, formats date in pt-BR and pluralizes model counts", () => {
    expect(providerStatusTone("valida")).toBe("success");
    expect(providerStatusTone("erro")).toBe("danger");
    expect(providerLastTestLabel(null)).toBe("Nunca testada");
    expect(providerLastTestLabel("not-a-date")).toBe("Nunca testada");
    expect(providerLastTestLabel("2026-11-20T12:00:00.000Z")).toBe(new Date("2026-11-20T12:00:00.000Z").toLocaleString("pt-BR"));
    expect(providerModelCountLabel(1)).toBe("1 modelo");
    expect(providerModelCountLabel(4)).toBe("4 modelos");
  });
});
