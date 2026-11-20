import { useCallback, useEffect, useState } from "react";
import { formatNotificationDate, notificationKindLabel, type DesktopNotification } from "../../lib/notifications";

type Props = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string; open: boolean; onCountChange: (count: number) => void; onOpenSuggestion?: (id: string) => void };

export function NotificationsPanel({ apiFetch, apiUrl, open, onCountChange, onOpenSuggestion }: Props) {
  const [items, setItems] = useState<DesktopNotification[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiUrl}/notifications`);
      if (!response.ok) throw new Error("load");
      const list = await response.json() as DesktopNotification[];
      setItems(list); setError(false); onCountChange(list.length);
    } catch { setError(true); }
  }, [apiFetch, apiUrl, onCountChange]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  async function mark(id?: string) {
    setBusy(true);
    try {
      const response = id ? await apiFetch(`${apiUrl}/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }) : await apiFetch(`${apiUrl}/notifications/read-all`, { method: "POST" });
      if (!response.ok) throw new Error("mark");
      await load();
    } catch { setError(true); } finally { setBusy(false); }
  }
  if (!open) return null;
  return <section className="settings-card" aria-labelledby="notifications-title">
    <div className="page-header-row"><div><span className="section-label">Central de avisos</span><h2 id="notifications-title">Notificações</h2></div><button type="button" className="settings-tab" onClick={() => void mark()} disabled={busy || items.length === 0}>Marcar todas como lidas</button></div>
    {error && <p role="alert">Não foi possível carregar as notificações.</p>}
    {!error && items.length === 0 && <p>Você não tem avisos pendentes.</p>}
    <div style={{ display: "grid", gap: 10 }}>{items.map((item) => <article key={item.id} className="workspace-fact"><div><small>{notificationKindLabel(item.kind)} · {formatNotificationDate(item.createdAt)}</small><h3>{item.title}</h3><p>{item.body}</p></div><div className="notification-actions">{item.kind === "checkin.message" && typeof item.details?.suggestionId === "string" && <button type="button" className="settings-tab" onClick={() => onOpenSuggestion?.(item.details!.suggestionId as string)}>Abrir sugestão</button>}<button type="button" className="settings-tab" onClick={() => void mark(item.id)} disabled={busy}>Marcar como lida</button></div></article>)}</div>
  </section>;
}
