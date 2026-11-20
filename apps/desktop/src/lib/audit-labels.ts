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
};

export function auditActionLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
