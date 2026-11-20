export type ResponsibilityRecord = {
  id: string;
  ownerId: string;
  agentId: string;
  name: string;
  instructions: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  failureStreak: number;
  runsToday: number;
  runsDay: string | null;
  lastResult: string;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResponsibilityInput = { name: string; instructions: string; agentId: string; intervalMinutes: number };
export type ResponsibilityBody = ResponsibilityInput;

export function validateResponsibility(input: ResponsibilityInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 80) return "O nome deve ter de 1 a 80 caracteres.";
  if (!input.instructions.trim() || input.instructions.trim().length > 2000) return "A instrução deve ter de 1 a 2.000 caracteres.";
  if (!input.agentId) return "Selecione um bot.";
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 60 || input.intervalMinutes > 1440) return "O intervalo deve ser de 60 a 1440 minutos.";
  return null;
}

export function buildResponsibilityBody(input: ResponsibilityInput): ResponsibilityBody {
  return { name: input.name.trim(), instructions: input.instructions.trim(), agentId: input.agentId, intervalMinutes: input.intervalMinutes };
}

export function nextRunLabel(record: Pick<ResponsibilityRecord, "nextRunAt" | "enabled">, now = new Date()): string {
  if (!record.enabled) return "Pausada";
  const next = new Date(record.nextRunAt);
  if (Number.isNaN(next.getTime())) return "Agendamento indisponível";
  if (next.getTime() <= now.getTime()) return "Aguardando execução";
  return `Próxima execução: ${next.toLocaleString("pt-BR")}`;
}

export function canResumeResponsibility(record: Pick<ResponsibilityRecord, "enabled">): boolean {
  return !record.enabled;
}
