export function effectiveSkillTools(skills: Array<{ tools: string[] }>, allowed: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    for (const tool of skill.tools) {
      if (allowed.has(tool) && !seen.has(tool)) {
        seen.add(tool);
        result.push(tool);
      }
    }
  }
  return result;
}
