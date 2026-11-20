import { buildSkillsSystemMessage, SKILL_PROMPT_LIMIT } from "./skill-prompt";

describe("buildSkillsSystemMessage", () => {
  it("returns no message when there are no skills", () => {
    expect(buildSkillsSystemMessage([])).toBeUndefined();
  });

  it("uses the requested format and preserves skill order", () => {
    expect(buildSkillsSystemMessage([
      { title: "Pesquisa", instructions: "Verifique fontes." },
      { title: "Resumo", instructions: "Seja breve." },
    ])).toBe("Habilidades anexadas a este bot (instruções da pessoa dona, não concessões de ferramenta):\n## Pesquisa\nVerifique fontes.\n## Resumo\nSeja breve.");
  });

  it("cuts at 20,000 characters and excludes skills after the cut", () => {
    const message = buildSkillsSystemMessage([
      { title: "Longa", instructions: "x".repeat(SKILL_PROMPT_LIMIT) },
      { title: "Seguinte", instructions: "não deve entrar" },
    ]);
    expect(message).toHaveLength(SKILL_PROMPT_LIMIT);
    expect(message).not.toContain("Seguinte");
  });
});
