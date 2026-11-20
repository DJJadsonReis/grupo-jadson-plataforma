import { useEffect, useState } from "react";

type AuditRetentionView = { retentionDays: number | null; lastSweepAt: string | null; lastSweepDeleted: number | null };
type Props = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string };

export function AuditRetentionSettings({ apiFetch, apiUrl }: Props) {
  const [settings, setSettings] = useState<AuditRetentionView | null>(null);
  const [days, setDays] = useState("off");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmSweep, setConfirmSweep] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/audit/retention`).then(async (response) => {
      if (!response.ok) throw new Error();
      const value = await response.json() as AuditRetentionView;
      if (active) { setSettings(value); setDays(value.retentionDays === null ? "off" : String(value.retentionDays)); }
    }).catch(() => { if (active) setMessage("Não foi possível carregar a retenção da auditoria."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiFetch, apiUrl]);
  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await apiFetch(`${apiUrl}/audit/retention`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retentionDays: days === "off" ? null : Number(days) }) });
      if (!response.ok) throw new Error();
      setSettings(await response.json() as AuditRetentionView); setMessage("Retenção salva.");
    } catch { setMessage("Não foi possível salvar. Informe um prazo entre 1 e 3650 dias."); }
    finally { setBusy(false); }
  };
  const sweep = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await apiFetch(`${apiUrl}/audit/retention/sweep`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "Uma limpeza já está em andamento." : "Não foi possível limpar a auditoria.");
      const result = await response.json() as { deleted: number; settings: AuditRetentionView };
      setSettings(result.settings); setMessage(`${result.deleted} evento(s) removido(s).`); setConfirmSweep(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível limpar a auditoria."); }
    finally { setBusy(false); }
  };
  return <section className="settings-box" aria-labelledby="audit-retention-title">
    <h3 id="audit-retention-title">Retenção de auditoria</h3>
    <p>Defina por quanto tempo os eventos de auditoria ficam armazenados. A limpeza preserva eventos de aprovações pendentes.</p>
    {loading ? <p>Carregando…</p> : <>
      <label>Prazo de retenção
        <select aria-label="Prazo de retenção" value={days === "off" ? "off" : "days"} disabled={busy} onChange={(event) => setDays(event.target.value === "off" ? "off" : (settings?.retentionDays ? String(settings.retentionDays) : "30"))}>
          <option value="off">Desligada</option><option value="days">Prazo em dias</option>
        </select>
        {days !== "off" && <input aria-label="Dias de retenção" type="number" min={1} max={3650} step={1} value={days} disabled={busy} onChange={(event) => setDays(event.target.value)} />}
      </label>
      <p>Última limpeza: {settings?.lastSweepAt ? new Date(settings.lastSweepAt).toLocaleString("pt-BR") : "Ainda não executada"} · Eventos removidos: {settings?.lastSweepDeleted ?? "—"}</p>
      <div className="model-provider-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>Salvar</button><button type="button" className="danger-button" disabled={busy} onClick={() => setConfirmSweep(true)}>Limpar agora</button></div>
    </>}
    {confirmSweep && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="audit-sweep-title"><h2 id="audit-sweep-title">Limpar auditoria agora?</h2><p>Esta passagem vai aplicar o prazo selecionado e remover os eventos mais antigos.</p><div className="modal-actions"><button type="button" className="danger-button" disabled={busy} onClick={() => void sweep()}>Confirmar limpeza</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmSweep(false)}>Cancelar</button></div></section></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}

export function AuditRetentionSettingsForRole({ isAdmin, ...props }: Props & { isAdmin: boolean }) {
  return isAdmin ? <AuditRetentionSettings {...props} /> : null;
}
