import { describe, expect, it } from "vitest";
import { availabilityLabel, blocksModelSave } from "./model-availability";

describe("model availability", () => {
  it.each([["disponivel", "Disponível", false], ["indisponivel", "Indisponível", true], ["nao_verificado", "Não verificado", false]] as const)("maps %s", (status, label, blocked) => {
    expect(availabilityLabel(status)).toBe(label);
    expect(blocksModelSave(status)).toBe(blocked);
  });
});
