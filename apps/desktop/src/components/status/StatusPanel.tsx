import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toStatusRows, type HealthResponse } from "./status-rows";
import { shutdownAvailability, shutdownConfirmationText, shutdownResultMessage, stoppedServicesGuidance } from "../../lib/shutdown-plan";

type StatusPanelProps = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string };

export function StatusPanel({ apiFetch, apiUrl }: StatusPanelProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [confirmingShutdown, setConfirmingShutdown] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [shutdownMessage, setShutdownMessage] = useState<string | null>(null);
  const [stoppedByApp, setStoppedByApp] = useState(false);
  const [initialCheckPending, setInitialCheckPending] = useState(true);

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
      setInitialCheckPending(false);
    }
  }, [apiFetch, apiUrl]);

  const stopServices = async () => {
    setConfirmingShutdown(false);
    setStopping(true);
    setShutdownMessage(null);
    try {
      const result = await invoke<{ stdout: string; stderr: string }>("stop_local_services");
      const message = shutdownResultMessage({ exitCode: 0, stdout: result.stdout, stderr: result.stderr });
      setShutdownMessage(message);
      setStoppedByApp(!message.includes("Nenhum serviço local registrado para encerrar."));
    } catch (error) {
      setShutdownMessage(`Não foi possível encerrar os serviços locais. ${error instanceof Error ? error.message : String(error)}`);
      setStoppedByApp(false);
    } finally {
      await verify();
      setStopping(false);
    }
  };

  const shutdownAvailabilityState = shutdownAvailability(health, stopping, initialCheckPending);

  useEffect(() => { void verify(); }, [verify]);

  return <section className="page-content" aria-labelledby="dependency-status-title">
    <div className="page-header-row"><div><span className="section-label">Sistema</span><h1 id="dependency-status-title">Status dos serviços</h1><p className="page-subtitle">Estado dos serviços usados pelo aplicativo.</p></div></div>
    <div className="settings-card" aria-live="polite">
      {loading && <p role="status">Verificando…</p>}
      <ul>{toStatusRows(health).map((row) => <li key={row.label}>
        <strong>{row.label}</strong> <span>{row.state}</span>{row.label === "Fila" && health?.dependencies?.queue && <span> — {String(health.dependencies.queue.driver)} · {String(health.dependencies.queue.persistence)}</span>}
        {row.label === "Backend" && stoppedServicesGuidance(stoppedByApp) ? <p>{stoppedServicesGuidance(stoppedByApp)}</p> : row.guidance && <p>{row.guidance}</p>}
      </li>)}</ul>
      <p>Última verificação: {checkedAt ? checkedAt.toLocaleString("pt-BR") : "Ainda não verificado"}</p>
      <button type="button" className="settings-tab" onClick={() => void verify()} disabled={loading}>Verificar de novo</button>
      <button type="button" className="settings-tab" onClick={() => { setShutdownMessage(null); setConfirmingShutdown(true); }} disabled={!shutdownAvailabilityState.enabled} title={shutdownAvailabilityState.reason || undefined}>Parar serviços locais</button>
      {!shutdownAvailabilityState.enabled && !stopping && <p role="note">{stoppedByApp ? "Os serviços locais foram encerrados; o botão ficará disponível quando o backend voltar a responder." : shutdownAvailabilityState.reason}</p>}
      {stopping && <p role="status" aria-live="polite">Encerrando…</p>}
      {shutdownMessage && <p role="status" aria-live="polite">{shutdownMessage}</p>}
    </div>
    {confirmingShutdown && <div className="modal-backdrop">
      <section role="alertdialog" aria-modal="true" aria-labelledby="shutdown-title" aria-describedby="shutdown-description" className="settings-card">
        <h2 id="shutdown-title">Parar serviços locais?</h2>
        <p id="shutdown-description">{shutdownConfirmationText()}</p>
        <button type="button" className="settings-tab" onClick={() => setConfirmingShutdown(false)}>Cancelar</button>
        <button type="button" className="settings-tab" onClick={() => void stopServices()}>Confirmar encerramento</button>
      </section>
    </div>}
  </section>;
}
