import { describe, expect, it } from "vitest";
import { buildRoutinePayload, describeRoutineSchedule } from "./routines";

describe("buildRoutinePayload", () => {
  const base = { name: "Leitura diária", tool: "tempo.agora", frequency: "interval" as const, intervalMinutes: 30, dailyAt: "08:00" };
  it("monta payload de intervalo", () => expect(buildRoutinePayload(base)).toEqual({ name: "Leitura diária", tool: "tempo.agora", intervalMinutes: 30 }));
  it("monta payload diário", () => expect(buildRoutinePayload({ ...base, frequency: "daily" })).toEqual({ name: "Leitura diária", tool: "tempo.agora", dailyAt: "08:00" }));
  it("recusa nome ou ferramenta vazios", () => {
    expect(() => buildRoutinePayload({ ...base, name: " " })).toThrow();
    expect(() => buildRoutinePayload({ ...base, tool: "" })).toThrow();
  });
  it("recusa horário diário vazio", () => {
    expect(() => buildRoutinePayload({ ...base, frequency: "daily", dailyAt: "" })).toThrow();
  });
});

describe("describeRoutineSchedule", () => {
  it("descreve frequência diária", () => expect(describeRoutineSchedule({ tool: "tempo.agora", intervalMinutes: 1440, dailyAt: "08:00" })).toBe("tempo.agora todo dia às 08:00"));
  it("descreve intervalo", () => expect(describeRoutineSchedule({ tool: "tempo.agora", intervalMinutes: 30 })).toBe("tempo.agora a cada 30 min"));
});
