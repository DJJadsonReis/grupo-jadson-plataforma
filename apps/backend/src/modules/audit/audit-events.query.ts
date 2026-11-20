export interface AuditEventFilters {
  action?: string | undefined;
  actor?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface AuditCursor { createdAt: string; id: string }

export function parseAuditFilters(query: Record<string, unknown>): AuditEventFilters {
  const text = (key: string): string | undefined => {
    const value = query[key];
    if (value === undefined || value === "") return undefined;
    if (typeof value !== "string") throw new AuditQueryError(key === "limit" ? "INVALID_LIMIT" : key === "cursor" ? "INVALID_CURSOR" : "INVALID_FILTER", "Parâmetro inválido.");
    return value;
  };
  const action = text("action");
  const actor = text("actor");
  const from = text("from");
  const to = text("to");
  const cursor = text("cursor");
  if ((action?.length ?? 0) > 80 || (actor?.length ?? 0) > 80) throw new AuditQueryError("INVALID_FILTER", "Ação e pessoa devem ter até 80 caracteres.");
  for (const date of [from, to]) if (date !== undefined && !isIsoDate(date)) throw new AuditQueryError("INVALID_DATE", "Informe uma data ISO 8601 válida.");
  if (from && to && Date.parse(from) > Date.parse(to)) throw new AuditQueryError("INVALID_RANGE", "A data inicial deve ser anterior ou igual à data final.");
  const rawLimit = text("limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if ((rawLimit !== undefined && !/^\d+$/.test(rawLimit)) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new AuditQueryError("INVALID_LIMIT", "O limite deve ser um inteiro entre 1 e 100.");
  if (cursor) decodeAuditCursor(cursor);
  return { action, actor, from, to, limit, cursor };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  try {
    const date = value.slice(0, 10);
    if (new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) return false;
    if (value.length > 10) {
      const time = value.slice(11, 19);
      const [hour, minute, second] = time.split(":").map(Number);
      if (hour! > 23 || minute! > 59 || second! > 59) return false;
    }
    return Number.isFinite(Date.parse(value));
  } catch { return false; }
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string): AuditCursor {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid");
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof decoded.createdAt !== "string" || !isIsoDate(decoded.createdAt) || typeof decoded.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.id)) throw new Error("invalid");
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch { throw new AuditQueryError("INVALID_CURSOR", "O cursor da auditoria é inválido."); }
}

export class AuditQueryError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
