export const AUDIT_LABELS: Record<string, string> = {
  "chat.completion": "Resposta gerada",
  "approval.requested": "Aprovação solicitada",
  "approval.approved": "Aprovação concedida",
  "approval.rejected": "Aprovação recusada",
  "handoff.created": "Delegação entre agentes",
  "tool.run": "Ferramenta executada",
  "team.room.created": "Sala de equipe criada",
  "team.room.member_added": "Pessoa adicionada à sala",
  "team.room.member_removed": "Pessoa removida da sala",
  "checkin.created": "Check-in criado",
  "checkin.updated": "Check-in atualizado",
  "checkin.enabled": "Check-in ativado",
  "checkin.disabled": "Check-in desativado",
  "checkin.removed": "Check-in removido",
  "checkin.run": "Check-in executado",
  "checkin.suggestion.hidden": "Sugestão de check-in ocultada",
  "checkin.suggestion.started": "Conversa iniciada por check-in",
};

export function auditActionLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
