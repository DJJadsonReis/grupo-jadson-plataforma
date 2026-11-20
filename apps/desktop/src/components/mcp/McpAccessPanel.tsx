import { useEffect, useMemo, useState } from "react";
import { McpServerApi, type McpServerToken } from "../../lib/mcp-server-api";
import { buildMcpClientConfig, mcpTokenLastUsed, mcpTokenStatus } from "../../lib/mcp-server-config";

export function McpAccessPanel({ apiFetch, apiUrl }: { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string }) {
  const api = useMemo(() => new McpServerApi(apiFetch, apiUrl), [apiFetch, apiUrl]);
  const [tokens, setTokens] = useState<McpServerToken[]>([]);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<McpServerToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    try { setTokens(await api.list()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os tokens."); }
  }
  useEffect(() => { void refresh(); }, [api]);

  async function create() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const created = await api.create(name);
      setTokens((current) => [created.record, ...current]); setNewToken(created.token); setName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o token."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(true); setError(null);
    try { await api.revoke(revoking.id); setRevoking(null); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível revogar o token."); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Copiado."); }
    catch { setError("Não foi possível copiar. Selecione e copie o texto manualmente."); }
  }

  return <section className="settings-box mcp-access-panel">
    <h3>Acesso MCP</h3>
    <p>Crie um token para conectar um cliente MCP à plataforma. O token completo aparece uma única vez.</p>
    <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="mcp-access-create">
      <label>Nome do token<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Cursor do notebook" required /></label>
      <button type="submit" disabled={busy || !name.trim()}>Criar token</button>
    </form>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {newToken && <article className="mcp-token-once" aria-live="polite">
      <strong>Copie agora. Este token não será mostrado de novo.</strong>
      <code>{newToken}</code>
      <button type="button" onClick={() => void copy(newToken)}>Copiar token</button>
      <button type="button" onClick={() => setNewToken(null)}>Fechar</button>
    </article>}
    <div className="mcp-token-list">{tokens.map((token) => <article className="mcp-token-row" key={token.id}>
      <div><strong>{token.name}</strong><p>Criado em {new Date(token.createdAt).toLocaleString("pt-BR")}</p><p>Último uso: {mcpTokenLastUsed(token.lastUsedAt)}</p></div>
      <span>{mcpTokenStatus(token.revokedAt)}</span>
      {!token.revokedAt && <button type="button" onClick={() => setRevoking(token)}>Revogar</button>}
    </article>)}</div>
    <details><summary>Configurar cliente MCP</summary><p>Use este trecho e substitua o placeholder pelo token, somente no cliente.</p><pre>{buildMcpClientConfig(apiUrl)}</pre></details>
    {revoking && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="mcp-revoke-title">
      <h3 id="mcp-revoke-title">Revogar token?</h3><p>Este cliente “{revoking.name}” perderá o acesso imediatamente.</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRevoking(null)} disabled={busy}>Cancelar</button><button type="button" className="danger-button" onClick={() => void revoke()} disabled={busy}>Revogar</button></div>
    </section></div>}
  </section>;
}
