export const MIN_CHECKIN_INTERVAL_MINUTES = 60;
export const MAX_CHECKIN_INTERVAL_MINUTES = 1440;
export const MAX_ACTIVE_CHECKINS = 5;

export type CheckinSuggestion = { id: string; checkinId: string; title: string; text: string; sourceLink?: string | null; status: "aberta" | "ocultada" | "iniciada"; conversationId?: string | null; createdAt: string };
export type CheckinRecord = { id: string; agentId: string; focus: string; intervalMinutes: number; enabled: boolean; disabledReason?: string | null; lastStatus?: string | null };

export function validateCheckinForm(focus: string, intervalMinutes: number, activeCount: number, currentlyEnabled = false): string | null {
  if (!focus.trim()) return "Informe o foco do check-in.";
  if (focus.trim().length > 1000) return "O foco deve ter no máximo 1.000 caracteres.";
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < MIN_CHECKIN_INTERVAL_MINUTES || intervalMinutes > MAX_CHECKIN_INTERVAL_MINUTES) return "O intervalo deve ser de 60 a 1.440 minutos.";
  if (!currentlyEnabled && activeCount >= MAX_ACTIVE_CHECKINS) return `Você já tem ${MAX_ACTIVE_CHECKINS} check-ins ativos. Pause um antes de ativar outro.`;
  return null;
}

export function visibleSuggestions(suggestions: CheckinSuggestion[], checkinIds: Set<string>): CheckinSuggestion[] {
  return suggestions.filter((suggestion) => suggestion.status === "aberta" && checkinIds.has(suggestion.checkinId));
}

export function suggestionAction(suggestion: CheckinSuggestion): { kind: "open"; conversationId: string } | { kind: "start"; suggestionId: string } | { kind: "none" } {
  if (suggestion.status === "iniciada" && suggestion.conversationId) return { kind: "open", conversationId: suggestion.conversationId };
  if (suggestion.status === "aberta") return { kind: "start", suggestionId: suggestion.id };
  return { kind: "none" };
}
