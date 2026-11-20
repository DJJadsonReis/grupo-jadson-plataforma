export type DesktopNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  details?: Record<string, unknown>;
};

const KIND_LABELS: Record<string, string> = {
  "approval.pending": "Aprovação pendente",
  "routine.failed": "Rotina falhou",
  "tool_limit.reached": "Limite de ferramentas atingido",
  "responsibility.result": "Resultado de responsabilidade",
  "responsibility.disabled": "Responsabilidade desativada",
  "human_support.requested": "Atendimento humano solicitado",
  "checkin.message": "Novo check-in",
};

export function notificationKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "Notificação";
}

export function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "data desconhecida";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
  } catch {
    return "data desconhecida";
  }
}
