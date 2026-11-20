export type RoutineFrequency = "interval" | "daily";

export type RoutinePayloadInput = {
  name: string;
  tool: string;
  frequency: RoutineFrequency;
  intervalMinutes: number;
  dailyAt: string;
};

export type RoutinePayload = { name: string; tool: string; intervalMinutes: number } | { name: string; tool: string; dailyAt: string };

export type RoutineSchedule = { tool: string; intervalMinutes: number; dailyAt?: string | null };

export function buildRoutinePayload(input: RoutinePayloadInput): RoutinePayload {
  if (!input.name.trim()) throw new Error("Informe um nome para a rotina.");
  if (!input.tool.trim()) throw new Error("Selecione uma ferramenta.");
  if (input.frequency === "daily") {
    if (!input.dailyAt.trim()) throw new Error("Informe o horário diário.");
    return { name: input.name.trim(), tool: input.tool, dailyAt: input.dailyAt };
  }
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 15 || input.intervalMinutes > 1440) {
    throw new Error("O intervalo deve ser de 15 a 1440 minutos.");
  }
  return { name: input.name.trim(), tool: input.tool, intervalMinutes: input.intervalMinutes };
}

export function describeRoutineSchedule(routine: RoutineSchedule): string {
  return routine.dailyAt
    ? `${routine.tool} todo dia às ${routine.dailyAt}`
    : `${routine.tool} a cada ${routine.intervalMinutes} min`;
}
