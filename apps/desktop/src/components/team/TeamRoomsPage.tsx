import { useCallback, useEffect, useState, type FormEvent } from "react";
import { findMentionedBotNames, validateMessageText, validateRoomName, type RoomMessage, type TeamPerson, type TeamRoom } from "../../lib/team-rooms";
import { splitRichComponents } from "../../lib/rich-components";
import { RichComponent } from "../RichComponent";

type Props = { apiFetch: (input: string, init?: RequestInit) => Promise<Response>; apiUrl: string };
export function TeamRoomsPage({ apiFetch, apiUrl }: Props) {
  const [rooms, setRooms] = useState<TeamRoom[]>([]);
  const [selected, setSelected] = useState<TeamRoom | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [members, setMembers] = useState<TeamPerson[]>([]);
  const [people, setPeople] = useState<TeamPerson[]>([]);
  const [inviteId, setInviteId] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "member">("member");
  const [currentPersonId, setCurrentPersonId] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRooms = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/team-rooms`);
    if (!response.ok) throw new Error("Não foi possível carregar as salas.");
    setRooms(await response.json() as TeamRoom[]);
  }, [apiFetch, apiUrl]);
  const loadMessages = useCallback(async (roomId: string) => {
    const response = await apiFetch(`${apiUrl}/team-rooms/${encodeURIComponent(roomId)}/messages`);
    if (!response.ok) throw new Error("Não foi possível carregar as mensagens.");
    setMessages(await response.json() as RoomMessage[]);
  }, [apiFetch, apiUrl]);

  useEffect(() => { let active = true; setLoading(true); setError(null); loadRooms().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Erro de rede."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [loadRooms]);
  useEffect(() => { let active = true; apiFetch(`${apiUrl}/team-rooms/me`).then((r) => r.ok ? r.json() : Promise.reject(new Error("Não foi possível identificar a pessoa."))).then((person: { id: string }) => { if (active) setCurrentPersonId(person.id); }).catch(() => undefined); return () => { active = false; }; }, [apiFetch, apiUrl]);
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let active = true;
    const refresh = () => loadMessages(selected.id).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Erro de rede."); });
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected, loadMessages]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    Promise.all([
      apiFetch(`${apiUrl}/team-rooms/${encodeURIComponent(selected.id)}`).then((r) => r.ok ? r.json() : Promise.reject(new Error("Não foi possível carregar os membros."))),
      apiFetch(`${apiUrl}/team-rooms/people`).then((r) => r.ok ? r.json() : Promise.reject(new Error("Não foi possível carregar as pessoas."))),
    ]).then(([room, directory]) => { if (active) { setSelectedRole((room.members as { personId: string; name: string; role: "admin" | "member" }[]).find((p) => p.personId === currentPersonId)?.role ?? selected.role); setMembers((room.members as { personId: string; name: string }[]).map((p) => ({ id: p.personId, name: p.name }))); setPeople(directory as TeamPerson[]); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Erro de rede."); });
    return () => { active = false; };
  }, [selected, apiFetch, apiUrl, currentPersonId]);

  async function createRoom(event: FormEvent) {
    event.preventDefault(); const problem = validateRoomName(name); if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try { const r = await apiFetch(`${apiUrl}/team-rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }); if (!r.ok) throw new Error(r.status === 409 ? "Limite de 200 salas atingido." : "Não foi possível criar a sala."); const room = await r.json() as TeamRoom; setName(""); await loadRooms(); setSelected(room); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Erro de rede."); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); const problem = validateMessageText(draft); if (problem || !selected) { setError(problem); return; }
    setBusy(true); setError(null);
    try { const r = await apiFetch(`${apiUrl}/team-rooms/${encodeURIComponent(selected.id)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: draft }) }); if (!r.ok) throw new Error("Não foi possível enviar a mensagem."); await r.json(); setDraft(""); await loadMessages(selected.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Erro de rede."); } finally { setBusy(false); }
  }
  async function invite() {
    if (!selected) return;
    const person = people.find((candidate) => candidate.id === inviteId && !members.some((member) => member.id === candidate.id));
    if (!person) { setError("Todas as pessoas ativas já participam desta sala."); return; }
    setError(null);
    try { const r = await apiFetch(`${apiUrl}/team-rooms/${encodeURIComponent(selected.id)}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: person.id }) }); if (!r.ok) throw new Error(r.status === 409 ? "Limite de 50 pessoas atingido." : "Não foi possível convidar a pessoa."); const room = await r.json() as { members: { personId: string; name: string }[] }; setMembers(room.members.map((p) => ({ id: p.personId, name: p.name }))); setInviteId(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Erro de rede."); }
  }
  async function leave() {
    if (!selected) return;
    setError(null);
    try { if (!currentPersonId) throw new Error("Não foi possível identificar a pessoa nesta sessão."); const r = await apiFetch(`${apiUrl}/team-rooms/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(currentPersonId)}`, { method: "DELETE" }); if (!r.ok) throw new Error("Não foi possível sair desta sala."); setSelected(null); await loadRooms(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Erro de rede."); }
  }

  return <section className="page-content" aria-labelledby="team-rooms-title">
    <h1 id="team-rooms-title">Equipe</h1>
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(null); void (selected ? loadMessages(selected.id) : loadRooms()).catch((reason) => setError(reason instanceof Error ? reason.message : "Erro de rede.")); }}>Tentar de novo</button></div>}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 2fr", gap: 24 }}>
      <aside aria-label="Salas da equipe">
        <form onSubmit={(event) => void createRoom(event)}><label htmlFor="team-room-name">Nova sala</label><input id="team-room-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><button disabled={busy}>Criar sala</button></form>
        {loading ? <p>Carregando salas...</p> : rooms.length ? rooms.map((room) => <button key={room.id} type="button" onClick={() => { setSelected(room); setError(null); }}>{room.name}</button>) : <p>Nenhuma sala ainda.</p>}
      </aside>
      <div>
        {!selected ? <p>Escolha uma sala para ver a conversa.</p> : <>
          <h2>{selected.name}</h2><p>{members.map((member) => member.name).join(", ")}</p>
          {selectedRole === "admin" && <><select aria-label="Pessoa para convidar" value={inviteId} onChange={(event) => setInviteId(event.target.value)}><option value="">Selecione uma pessoa</option>{people.filter((p) => !members.some((m) => m.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" onClick={() => void invite()}>Convidar pessoa</button></>}
          <button type="button" onClick={() => void leave()}>Sair da sala</button>
          {messages.length === 0 ? <p>Esta sala ainda não tem mensagens.</p> : <ol>{messages.map((message) => <li key={message.id}><strong>{message.authorName}</strong>{message.authorKind === "person" ? <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p> : <div>{splitRichComponents(message.content).map((part, index) => part.kind === "component" ? <RichComponent key={index} component={part.component} /> : <MarkdownContent key={index} content={part.text} />)}</div>}</li>)}</ol>}
          <form onSubmit={(event) => void send(event)}><label htmlFor="team-room-message">Mensagem</label><textarea id="team-room-message" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} /><button disabled={busy}>Enviar</button></form>
        </>}
      </div>
    </div>
  </section>;
}

function MarkdownContent({ content }: { content: string }) { return <p style={{ whiteSpace: "pre-wrap" }}>{content}</p>; }
