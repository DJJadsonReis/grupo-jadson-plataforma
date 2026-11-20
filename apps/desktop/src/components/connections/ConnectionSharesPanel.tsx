import { useEffect, useState } from "react";
import { canRevokeShare, shareStatusLabel, validateShareTarget, type SharePerson } from "../../lib/connection-shares";

type ShareRow = { ownerId?: string; granteeId?: string; id?: string; name?: string; status: string };
export function ConnectionSharesPanel({ apiFetch, apiUrl }: { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string }) {
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRow[]>([]);
  const [incoming, setIncoming] = useState<ShareRow[]>([]);
  const [pending, setPending] = useState<ShareRow[]>([]);
  const [target, setTarget] = useState("");
  const [personId, setPersonId] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() {
    const [shareResponse, peopleResponse] = await Promise.all([apiFetch(`${apiUrl}/connection-shares`), apiFetch(`${apiUrl}/team-rooms/people`)]);
    if (shareResponse.ok) { const body = await shareResponse.json(); setOutgoing(body.outgoing); setIncoming(body.incoming); }
    if (peopleResponse.ok) setPeople(await peopleResponse.json());
    const meResponse = await apiFetch(`${apiUrl}/team-rooms/me`); if (meResponse.ok) setPersonId((await meResponse.json()).id);
    const pendingResponse = await apiFetch(`${apiUrl}/connection-shares/pending`);
    if (pendingResponse.ok) setPending(await pendingResponse.json()); else setPending([]);
  }
  useEffect(() => { void refresh(); }, []);
  async function requestShare() {
    const error = validateShareTarget(personId, target, people);
    if (error) { setMessage(error); return; }
    const response = await apiFetch(`${apiUrl}/connection-shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ granteeId: target }) });
    setMessage(response.ok ? "Pedido enviado para aprovação." : "Não foi possível compartilhar a conexão."); if (response.ok) { setTarget(""); await refresh(); }
  }
  async function revoke(share: ShareRow) {
    const id = share.granteeId ?? share.id;
    if (!id) return;
    const response = await apiFetch(`${apiUrl}/connection-shares/${id}?ownerId=${encodeURIComponent(personId)}`, { method: "DELETE" });
    setMessage(response.ok ? "Compartilhamento revogado." : "Não foi possível revogar."); await refresh();
  }
  async function approve(share: ShareRow) {
    const response = await apiFetch(`${apiUrl}/connection-shares/${share.ownerId}/${share.granteeId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setMessage(response.ok ? "Pedido aprovado." : "Não foi possível aprovar."); await refresh();
  }
  return <article className="settings-box"><h3>Compartilhamento da conexão Google</h3><p>Peça acesso para outra pessoa; um admin precisa aprovar.</p>
    <div className="security-notice"><select aria-label="Pessoa para compartilhar" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Escolha uma pessoa</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="primary-button" onClick={() => void requestShare()}>Compartilhar minha conexão</button></div>
    {message && <p role="status">{message}</p>}
    <h4>Compartilhado com</h4>{outgoing.map((s) => <div key={s.granteeId}><span>{s.name} · {shareStatusLabel(s.status)}</span>{canRevokeShare(personId, false, { ...s, ownerId: personId }) && <button onClick={() => void revoke(s)}>Revogar</button>}</div>)}
    <h4>Usando a conexão de</h4>{incoming.map((s) => <div key={s.ownerId ?? s.id}><span>{s.name} · {shareStatusLabel(s.status)}</span></div>)}
    {pending.length > 0 && <><h4>Pedidos para aprovar</h4>{pending.map((s) => <div key={`${s.ownerId}-${s.granteeId}`}><span>{s.ownerId} → {s.granteeId}</span><button onClick={() => void approve(s)}>Aprovar</button></div>)}</>}
  </article>;
}
