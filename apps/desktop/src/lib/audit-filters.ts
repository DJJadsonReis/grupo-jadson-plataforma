export interface AuditFilters { action: string; actor: string; from: string; to: string; limit: number }

function localDayStart(value: string, dayOffset = 0): Date {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day + dayOffset);
}

export function validateAuditRange(filters: Pick<AuditFilters, "from" | "to">): string | null {
  if (filters.from && filters.to && new Date(filters.from).getTime() > new Date(filters.to).getTime()) return "A data inicial deve ser anterior ou igual à data final.";
  return null;
}

export function buildAuditQuery(filters: AuditFilters, cursor?: string | null): string {
  const query = new URLSearchParams();
  if (filters.action) query.set("action", filters.action);
  if (filters.actor) query.set("actor", filters.actor);
  if (filters.from) query.set("from", localDayStart(filters.from).toISOString());
  if (filters.to) query.set("to", localDayStart(filters.to, 1).toISOString());
  query.set("limit", String(filters.limit));
  if (cursor) query.set("cursor", cursor);
  return query.toString();
}

export function auditErrorMessage(code?: string): string {
  switch (code) {
    case "INVALID_RANGE": return "A data inicial deve ser anterior ou igual à data final.";
    case "INVALID_LIMIT": return "O limite de eventos informado é inválido.";
    case "INVALID_CURSOR": return "A página solicitada expirou. Tente carregar novamente.";
    case "INVALID_DATE": return "Informe datas válidas.";
    default: return "Não foi possível carregar a auditoria. Tente novamente.";
  }
}
