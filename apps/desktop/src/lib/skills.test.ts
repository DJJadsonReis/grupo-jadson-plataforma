import { describe, expect, it } from "vitest";
import { agentSkillUrl, agentSkillsUrl, buildCreateBody, canCreateGlobal, canDeleteSkill, readErrorMessage, toggleTool, validateInstructions, validateSlug, validateTitle } from "./skills";

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

  it("builds tool grants and only enables global creation for admins", () => {
    expect(buildCreateBody("writing", "Writing", "", "Write clearly.")).toEqual({ slug: "writing", title: "Writing", summary: "", instructions: "Write clearly.", tools: [] });
    expect(buildCreateBody("writing", "Writing", "", "Write clearly.", ["tempo.agora", "tempo.agora"])).toEqual({ slug: "writing", title: "Writing", summary: "", instructions: "Write clearly.", tools: ["tempo.agora"] });
    expect(buildCreateBody("writing", "Writing", "", "Write clearly.", [], true, true)).toHaveProperty("global", true);
    expect(buildCreateBody("writing", "Writing", "", "Write clearly.", [], false, true)).not.toHaveProperty("global", true);
    expect(buildCreateBody("writing", "Writing", "", "Write clearly.", [], true, false)).not.toHaveProperty("global", true);
  });

  it("toggles tools without duplicates", () => {
    expect(toggleTool(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleTool(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleTool(["a"], "a", true)).toEqual(["a"]);
  });

  it("checks global control and deletion permissions", () => {
    expect(canCreateGlobal(true)).toBe(true);
    expect(canCreateGlobal(false)).toBe(false);
    expect(canDeleteSkill({ global: true }, true)).toBe(true);
    expect(canDeleteSkill({ global: true }, false)).toBe(false);
    expect(canDeleteSkill({ global: false }, false)).toBe(true);
  });

  it("builds agent skill URLs", () => {
    expect(agentSkillsUrl("/api", "agent/1")).toBe("/api/agents/agent%2F1/skills");
    expect(agentSkillUrl("/api", "agent/1", "my skill")).toBe("/api/agents/agent%2F1/skills/my%20skill");
  });

  it("reads API messages and falls back for invalid bodies", () => {
    expect(readErrorMessage({ message: "Este slug já está em uso." }, "Erro")).toBe("Este slug já está em uso.");
    expect(readErrorMessage("invalid", "Não foi possível concluir.")).toBe("Não foi possível concluir.");
  });
});
