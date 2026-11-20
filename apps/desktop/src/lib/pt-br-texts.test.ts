import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  "App.tsx",
  "components/audit/AuditRetentionSettings.tsx",
  "components/connections/ConnectionSharesPanel.tsx",
  "components/mcp/McpAccessPanel.tsx",
  "components/mcp/McpServersPanel.tsx",
  "components/notifications/NotificationsPanel.tsx",
  "components/preferences/PreferencesPanel.tsx",
  "components/responsibilities/ResponsibilitiesPage.tsx",
  "components/skills/SkillsPage.tsx",
  "components/status/StatusPanel.tsx",
  "components/tasks/TasksPage.tsx",
  "components/team/TeamRoomsPage.tsx",
  "components/tour/StarterTour.tsx",
];

// Lista curta de erros ortográficos comuns; cada padrão exige limite de palavra.
const missingAccents = [
  /\bnao\b/i, /\bvoce\b/i, /\bconfiguracao\b/i, /\bfuncao\b/i,
  /\bacao\b/i, /\bultimo\b/i, /\bpossivel\b/i, /\bproximo\b/i,
  /\bsessao\b/i, /\bhistorico\b/i, /\bnotificacoes\b/i, /\balteracoes\b/i,
];

function visibleStrings(source: string): string[] {
  const strings: string[] = [];
  for (const match of source.matchAll(/>([^<>]+)</g)) strings.push(match[1]!);
  for (const match of source.matchAll(/(?:aria-label|aria-description|placeholder|title)="([^"]+)"/g)) strings.push(match[1]!);
  return strings.map((value) => value.replace(/\{[^}]*\}/g, " "));
}

describe("textos visíveis em português", () => {
  it("não contém as formas sem acento da lista revisada", () => {
    const violations = files.flatMap((file) => visibleStrings(readFileSync(`${root}${file}`, "utf8"))
      .flatMap((value) => missingAccents.filter((pattern) => pattern.test(value)).map((pattern) => `${file}: ${value.trim()} (${pattern})`)));
    expect(violations).toEqual([]);
  });
});
