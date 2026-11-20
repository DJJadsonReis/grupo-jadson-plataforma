import { buildSkillsSystemMessage, SKILL_PROMPT_LIMIT } from "./skill-prompt";
import { DatabaseService } from "../database/database.service";
import { AgentSkillsService } from "./agent-skills.service";

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

  it("includes an attached global skill in the prompt", async () => {
    const rows = [{ title: "Global", instructions: "Regra compartilhada." }];
    const query = jest.fn().mockResolvedValue({ rows });
    const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
    const skills = new AgentSkillsService(database);
    const prompt = buildSkillsSystemMessage(await skills.loadPromptSkills("agent-id"));
    expect(prompt).toContain("## Global\nRegra compartilhada.");
  });
});
