import { describe, expect, it } from "vitest";
import { buildResponsibilityBody, canResumeResponsibility, nextRunLabel, validateResponsibility, type ResponsibilityRecord } from "./responsibilities";

const input = { name: "Resumo diário", instructions: "Resuma os avisos.", agentId: "agent-1", intervalMinutes: 60 };

describe("responsibility helpers", () => {
  it("validates limits and required fields", () => {
    expect(validateResponsibility(input)).toBeNull();
    expect(validateResponsibility({ ...input, intervalMinutes: 59 })).toContain("60 a 1440");
    expect(validateResponsibility({ ...input, intervalMinutes: 1441 })).toContain("60 a 1440");
    expect(validateResponsibility({ ...input, name: " " })).toContain("nome");
    expect(validateResponsibility({ ...input, instructions: " " })).toContain("instrução");
    expect(validateResponsibility({ ...input, agentId: "" })).toContain("bot");
    expect(validateResponsibility({ ...input, name: "x".repeat(81) })).not.toBeNull();
    expect(validateResponsibility({ ...input, instructions: "x".repeat(2001) })).not.toBeNull();
  });

  it("builds a trimmed API body", () => {
    expect(buildResponsibilityBody({ ...input, name: " Resumo diário ", instructions: " Resuma. " })).toEqual({ ...input, name: "Resumo diário", instructions: "Resuma." });
  });

  it("labels next run and resume state", () => {
    const record = { enabled: true, nextRunAt: "2026-11-20T12:00:00.000Z" };
    expect(nextRunLabel(record, new Date("2026-11-20T11:00:00.000Z"))).toContain("Próxima execução");
    expect(nextRunLabel({ ...record, enabled: false })).toBe("Pausada");
    expect(canResumeResponsibility({ enabled: false })).toBe(true);
    expect(canResumeResponsibility({ enabled: true })).toBe(false);
  });
});
