import { useCallback, useEffect, useState } from "react";
import { toStatusRows, type HealthResponse } from "./status-rows";

type StatusPanelProps = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string };

export function StatusPanel({ apiFetch, apiUrl }: StatusPanelProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const verify = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/health`);
      if (!response.ok) throw new Error("health request failed");
      setHealth(await response.json() as HealthResponse);
    } catch {
      setHealth(null);
    } finally {
      setCheckedAt(new Date());
      setLoading(false);
    }
  }, [apiFetch, apiUrl]);

  useEffect(() => { void verify(); }, [verify]);

  return <section className="page-content" aria-labelledby="dependency-status-title">
    <div className="page-header-row"><div><span className="section-label">Sistema</span><h1 id="dependency-status-title">Status dos serviços</h1><p className="page-subtitle">Estado dos serviços usados pelo aplicativo.</p></div></div>
    <div className="settings-card" aria-live="polite">
      {loading && <p role="status">Verificando…</p>}
      <ul>{toStatusRows(health).map((row) => <li key={row.label}>
        <strong>{row.label}</strong> <span>{row.state}</span>{row.label === "Fila" && health?.dependencies?.queue && <span> — {String(health.dependencies.queue.driver)} · {String(health.dependencies.queue.persistence)}</span>}
        {row.guidance && <p>{row.guidance}</p>}
      </li>)}</ul>
      <p>Última verificação: {checkedAt ? checkedAt.toLocaleString("pt-BR") : "Ainda não verificado"}</p>
      <button type="button" className="settings-tab" onClick={() => void verify()} disabled={loading}>Verificar de novo</button>
    </div>
  </section>;
}
