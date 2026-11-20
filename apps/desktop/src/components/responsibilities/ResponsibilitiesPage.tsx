import { useCallback, useEffect, useState, type FormEvent } from "react";
import { buildResponsibilityBody, canResumeResponsibility, nextRunLabel, validateResponsibility, type ResponsibilityRecord } from "../../lib/responsibilities";
import { readErrorMessage, type AgentInfo } from "../../lib/skills";

type Props = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string; agents: AgentInfo[] };

export function ResponsibilitiesPage({ apiFetch, apiUrl, agents }: Props) {
  const [items, setItems] = useState<ResponsibilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ResponsibilityRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const response = await apiFetch(`${apiUrl}/responsibilities`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível carregar as responsabilidades."));
      setItems(body as ResponsibilityRecord[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as responsabilidades.");
    } finally { setLoading(false); }
  }, [apiFetch, apiUrl]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(null); setActionError(null);
    const input = { name, instructions, agentId, intervalMinutes };
    const error = validateResponsibility(input);
    if (error) { setFormError(error); return; }
    setBusy(true);
    try {
      const response = await apiFetch(`${apiUrl}/responsibilities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildResponsibilityBody(input)) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível criar a responsabilidade."));
      setName(""); setInstructions(""); setAgentId(""); setIntervalMinutes(60); await load();
    } catch (error) { setFormError(error instanceof Error ? error.message : "Não foi possível criar a responsabilidade."); }
    finally { setBusy(false); }
  }

  async function toggle(item: ResponsibilityRecord) {
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/responsibilities/${encodeURIComponent(item.id)}/enabled`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !item.enabled }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível alterar a responsabilidade."));
      await load();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Não foi possível alterar a responsabilidade."); }
  }

  async function remove(item: ResponsibilityRecord) {
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/responsibilities/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível excluir a responsabilidade."));
      setDeleteCandidate(null); await load();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Não foi possível excluir a responsabilidade."); }
  }

  return <section className="page-content" aria-labelledby="responsibilities-heading">
    <h1 id="responsibilities-heading">Responsabilidades</h1>
    <form onSubmit={(event) => void create(event)}>
      <h2>Nova responsabilidade</h2>
      <label htmlFor="responsibility-name">Nome</label>
      <input id="responsibility-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor="responsibility-agent">Bot</label>
      <select id="responsibility-agent" value={agentId} onChange={(event) => setAgentId(event.target.value)} required>
        <option value="">Selecione um bot</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select>
      <label htmlFor="responsibility-instructions">Instrução</label>
      <textarea id="responsibility-instructions" value={instructions} maxLength={2000} onChange={(event) => setInstructions(event.target.value)} required />
      <label htmlFor="responsibility-interval">Intervalo</label>
      <select id="responsibility-interval" value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))}>
        {[60, 120, 360, 720, 1440].map((minutes) => <option key={minutes} value={minutes}>{minutes < 1440 ? `${minutes / 60} hora(s)` : "24 horas"}</option>)}
      </select>
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy || agents.length === 0}>{busy ? "Criando..." : "Criar responsabilidade"}</button>
      {agents.length === 0 && <p>Nenhum bot acessível para selecionar.</p>}
    </form>
    {actionError && <p role="alert">{actionError}</p>}
    {loading ? <p>Carregando responsabilidades…</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void load()}>Tentar de novo</button></div>
      : items.length === 0 ? <p>Ainda não há responsabilidades.</p> : <ul>{items.map((item) => {
        const agent = agents.find((candidate) => candidate.id === item.agentId);
        return <li key={item.id}>
          <h2>{item.name}</h2>
          <p>Bot: {agent?.name ?? "Bot indisponível"} · Intervalo: {item.intervalMinutes} min</p>
          <p>Status: {item.disabledReason ? "Desligada automaticamente" : item.enabled ? "Ativa" : "Pausada"}</p>
          <p>{nextRunLabel(item)}</p>
          {item.lastRunAt && <p>Última execução: {new Date(item.lastRunAt).toLocaleString("pt-BR")}</p>}
          {item.lastStatus && <p>Resultado: {({ done: "Concluída", failed: "Falhou", needs_approval: "Precisa de aprovação", skipped_daily_limit: "Limite diário atingido" } as Record<string, string>)[item.lastStatus] ?? item.lastStatus}</p>}
          {item.lastResult && <p>{item.lastResult}</p>}
          {item.disabledReason && <p>Motivo: {item.disabledReason}</p>}
          <button type="button" onClick={() => void toggle(item)}>{canResumeResponsibility(item) ? "Retomar" : "Pausar"}</button>
          <button type="button" className="danger-button" onClick={() => setDeleteCandidate(item)}>Excluir</button>
        </li>;
      })}</ul>}
    {deleteCandidate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteCandidate(null); }}><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="responsibility-delete-title"><h2 id="responsibility-delete-title">Excluir responsabilidade?</h2><p>A responsabilidade “{deleteCandidate.name}” será excluída.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteCandidate(null)}>Cancelar</button><button type="button" className="danger-button" onClick={() => void remove(deleteCandidate)}>Excluir</button></div></section></div>}
  </section>;
}
