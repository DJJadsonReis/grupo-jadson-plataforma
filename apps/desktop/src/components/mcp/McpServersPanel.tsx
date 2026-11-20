import { useEffect, useState } from "react";
import { listMcpServers, saveMcpServer, type McpServerDraft } from "../../lib/mcp-servers";

type Server = { id: string; name: string; transport: "stdio" | "http"; url: string; command: string; args: string[]; enabled: boolean; status: "connected" | "error"; message: string; toolCount: number; hasEnv: boolean; hasHeaders: boolean };
type Props = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string };
const blank: McpServerDraft = { name: "", transport: "stdio", command: "", argsText: "", url: "", headers: {}, env: {}, enabled: true };

export function McpServersPanel({ apiFetch, apiUrl }: Props) {
  const [servers, setServers] = useState<Server[]>([]);
  const [draft, setDraft] = useState<McpServerDraft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const endpoint = `${apiUrl}/mcp/servers`;
  const reload = async () => { setServers(await listMcpServers((input, init) => apiFetch(input, init), endpoint) as Server[]); };
  useEffect(() => { void Promise.all([reload(), apiFetch(`${endpoint}/capabilities`).then((response) => response.ok ? response.json() as Promise<{ canManage: boolean }> : { canManage: false }).then((value) => setIsAdmin(value.canManage))]).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao carregar.")); }, []);
  const save = async () => {
    setError(""); setBusy(true);
    try { const response = await saveMcpServer((input, init) => apiFetch(input, init), endpoint, draft, editing ?? undefined); if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string | string[] } | null; throw new Error(Array.isArray(body?.message) ? body.message.join(" ") : body?.message || "Não foi possível salvar o servidor MCP."); } setDraft(blank); setEditing(null); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar."); } finally { setBusy(false); }
  };
  const edit = (server: Server) => { setEditing(server.id); setDraft({ name: server.name, transport: server.transport, command: server.command, argsText: server.args.join("\n"), url: server.url, headers: {}, env: {}, enabled: server.enabled }); };
  const remove = async (server: Server) => { if (!window.confirm(`Remover o servidor ${server.name}?`)) return; const response = await apiFetch(`${endpoint}/${server.id}`, { method: "DELETE" }); if (!response.ok) { setError("Não foi possível remover o servidor MCP."); return; } await reload(); };
  const patch = (key: keyof McpServerDraft, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  return <article className="settings-box"><h3>Servidores MCP</h3><p>Servidores locais conectados às ferramentas da plataforma.</p>{error && <p role="alert">{error}</p>}
    {servers.length ? servers.map((server) => <div className="workspace-fact" key={server.id}><span><strong>{server.name}</strong><small> · {server.status === "connected" ? "Conectado" : `Erro: ${server.message || "indisponível"}`} · {server.toolCount} ferramentas</small></span>{isAdmin && <span><button type="button" className="btn-outline-sm" onClick={() => edit(server)}>Editar</button><button type="button" className="btn-outline-sm" onClick={() => void remove(server)}>Remover</button></span>}</div>) : <p>Nenhum servidor MCP cadastrado.</p>}
    {isAdmin && <div className="form-stack"><h4>{editing ? "Editar servidor" : "Adicionar servidor"}</h4><label>Nome<input value={draft.name} onChange={(e) => patch("name", e.target.value)} /></label><label>Transporte<select value={draft.transport} onChange={(e) => setDraft((current) => ({ ...current, transport: e.target.value as "stdio" | "http" }))}><option value="stdio">Local (stdio)</option><option value="http">Remoto (HTTP)</option></select></label>{draft.transport === "http" ? <><label>URL do servidor MCP<input type="url" value={draft.url} placeholder="https://servidor/mcp" onChange={(e) => patch("url", e.target.value)} /></label><label>Cabeçalhos HTTP (opcional; valores secretos)</label><EnvFields values={draft.headers} onChange={(headers) => setDraft((current) => ({ ...current, headers }))} hasSaved={Boolean(editing && servers.find((server) => server.id === editing)?.hasHeaders)} /></> : <><label>Comando<input value={draft.command} onChange={(e) => patch("command", e.target.value)} /></label><label>Argumentos (um por linha)<textarea value={draft.argsText} onChange={(e) => patch("argsText", e.target.value)} /></label><label>Variáveis de ambiente (chave/valor; campos sensíveis)</label><EnvFields values={draft.env} onChange={(env) => setDraft((current) => ({ ...current, env }))} hasSaved={Boolean(editing && servers.find((server) => server.id === editing)?.hasEnv)} /></>}<label><input type="checkbox" checked={draft.enabled} onChange={(e) => patch("enabled", e.target.checked)} /> Ligado</label><div><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar servidor"}</button>{editing && <button type="button" className="btn-outline-sm" onClick={() => { setEditing(null); setDraft(blank); }}>Cancelar</button>}</div></div>}
  </article>;
}

function EnvFields({ values, onChange, hasSaved }: { values: Record<string, string>; onChange: (next: Record<string, string>) => void; hasSaved?: boolean }) {
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  useEffect(() => { setRows(Object.entries(values).length ? Object.entries(values).map(([key, value]) => ({ key, value })) : [{ key: "", value: "" }]); }, [values]);
  const update = (index: number, field: "key" | "value", value: string) => {
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row);
    setRows(next);
    onChange(Object.fromEntries(next.filter((row) => row.key && row.value).map((row) => [row.key, row.value])));
  };
  return <div>{rows.map((row, index) => <div className="workspace-fact" key={index}><input aria-label="Chave da variável" placeholder="CHAVE" value={row.key} onChange={(event) => update(index, "key", event.target.value)} /><input aria-label="Valor da variável" type="password" autoComplete="new-password" placeholder={hasSaved ? "Já salvo" : "Valor"} value={row.value} onChange={(event) => update(index, "value", event.target.value)} /></div>)}<button type="button" className="btn-outline-sm" onClick={() => setRows((current) => [...current, { key: "", value: "" }])}>Adicionar variável</button></div>;
}
