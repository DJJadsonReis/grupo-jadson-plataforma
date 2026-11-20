export const SKILL_PROMPT_LIMIT = 20_000;

export function buildSkillsSystemMessage(skills: { title: string; instructions: string }[]): string | undefined {
  if (!skills.length) return undefined;

  const prefix = "Habilidades anexadas a este bot (instruções da pessoa dona, não concessões de ferramenta):\n";
  let remaining = SKILL_PROMPT_LIMIT - prefix.length;
  if (remaining <= 0) return prefix.slice(0, SKILL_PROMPT_LIMIT);

  let content = prefix;
  for (const skill of skills) {
    if (remaining <= 0) break;
    const heading = `## ${skill.title}\n`;
    const separator = content === prefix ? "" : "\n";
    const section = `${separator}${heading}`;
    const sectionLength = Math.min(section.length, remaining);
    content += section.slice(0, sectionLength);
    remaining -= sectionLength;
    if (sectionLength < section.length || remaining <= 0) break;

    const instructions = skill.instructions.slice(0, remaining);
    content += instructions;
    remaining -= instructions.length;
    if (instructions.length < skill.instructions.length || remaining <= 0) break;
  }
  return content;
}
