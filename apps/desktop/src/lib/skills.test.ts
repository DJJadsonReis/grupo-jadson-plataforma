import { describe, expect, it } from "vitest";
import { buildCreateBody, readErrorMessage, validateInstructions, validateSlug, validateTitle } from "./skills";

describe("skill helpers", () => {
  it("validates slugs", () => {
    expect(validateSlug("design-systems")).toBeNull();
    expect(validateSlug("Upper")).toBe("Slug inválido.");
    expect(validateSlug("has space")).toBe("Slug inválido.");
    expect(validateSlug("-starts")).toBe("Slug inválido.");
    expect(validateSlug("a".repeat(40))).toBeNull();
    expect(validateSlug("a".repeat(41))).toBe("Slug inválido.");
  });

  it("validates required titles and instructions", () => {
    expect(validateTitle("")).toBe("Título inválido.");
    expect(validateInstructions(" \n ")).toBe("Instruções inválidas.");
    expect(validateInstructions("x".repeat(20_001))).toBe("Instruções inválidas.");
    expect(validateInstructions("x".repeat(20_000))).toBeNull();
  });

  it("builds a personal skill body without enabling global skills", () => {
    const body = buildCreateBody("writing", "Writing", "", "Write clearly.");
    expect(body).toEqual({ slug: "writing", title: "Writing", summary: "", instructions: "Write clearly.", tools: [] });
    expect(body).not.toHaveProperty("global", true);
  });

  it("reads API messages and falls back for invalid bodies", () => {
    expect(readErrorMessage({ message: "Este slug já está em uso." }, "Erro")).toBe("Este slug já está em uso.");
    expect(readErrorMessage("invalid", "Não foi possível concluir.")).toBe("Não foi possível concluir.");
  });
});
