import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { parseWorkspace, serializeWorkspace, type Agent, type ChatMessage, type Conversation } from "./lib/workspace";
import {
  Activity, ArrowUpRight, Bot, Boxes, BrainCircuit, Check, ChevronDown, CircleHelp,
  Clock3, Cpu, FileText, FolderOpen, Gauge, ListTodo, LoaderCircle, MessageSquare, Paperclip,
  PanelRight, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Square, Star, Workflow, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import logo from "./assets/grupo-jadson-logo.png";

type PageId = "dashboard" | "chat" | "agents" | "agent-detail" | "conversations" | "groups" | "computers" | "memory" | "automations" | "tools" | "models" | "files" | "activity" | "monitoring" | "settings";
type Health = "checking" | "connected" | "unavailable";
type ProviderStatus = { id: string; name: string; configured: boolean };

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3333/api/v1";
const NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "Início", icon: Gauge },
  { id: "agents", label: "Meus agentes", icon: Bot },
  { id: "conversations", label: "Conversas", icon: MessageSquare },
  { id: "groups", label: "Grupos de agentes", icon: Boxes },
  { id: "automations", label: "Rotinas", icon: Workflow },
  { id: "tools", label: "Ferramentas", icon: FolderOpen },
  { id: "memory", label: "Memória", icon: BrainCircuit },
  { id: "files", label: "Arquivos", icon: FileText },
  { id: "activity", label: "Histórico de atividades", icon: Activity },
  { id: "settings", label: "Configurações", icon: Settings },
];
const SECONDARY_NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: "computers", label: "Workspace do agente", icon: Cpu },
  { id: "models", label: "Modelos e provedores", icon: BrainCircuit },
  { id: "monitoring", label: "Monitoramento", icon: Activity },
];
const STORAGE_KEY = "grupo-jadson.workspace.v1";

function readWorkspace() {
  try { return parseWorkspace(localStorage.getItem(STORAGE_KEY)); }
  catch { return parseWorkspace(null); }
}

function readFavoriteAgents(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("grupo-jadson.favorite-agents") ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [health, setHealth] = useState<Health>("checking");
  const [postgresHealth, setPostgresHealth] = useState<Health>("checking");
  const [vectorHealth, setVectorHealth] = useState<Health>("checking");
  const [redisHealth, setRedisHealth] = useState<Health>("checking");
  const [configuredProviders, setConfiguredProviders] = useState<number | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() => readWorkspace().conversations);
  const [agents, setAgents] = useState<Agent[]>(() => readWorkspace().agents);
  const [remoteAgentIds, setRemoteAgentIds] = useState<string[]>([]);
  const [agentPersistence, setAgentPersistence] = useState<"checking" | "connected" | "local" | "error">("checking");
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [agentEditor, setAgentEditor] = useState<Agent | null>(null);
  const [viewedAgentId, setViewedAgentId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("grupo-jadson.sidebar-collapsed") === "true");
  const [agentSearch, setAgentSearch] = useState("");
  const [favoriteAgentIds, setFavoriteAgentIds] = useState<string[]>(readFavoriteAgents);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => conversations.find((c) => c.id === activeConversation) ?? null, [conversations, activeConversation]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { dependencies?: { postgres?: string; pgvector?: string; redis?: string } };
        setHealth("connected");
        setPostgresHealth(data.dependencies?.postgres === "connected" ? "connected" : "unavailable");
        setVectorHealth(data.dependencies?.pgvector === "connected" ? "connected" : "unavailable");
        setRedisHealth(data.dependencies?.redis === "connected" ? "connected" : "unavailable");
      })
      .then(() => fetch(`${API_URL}/providers`, { signal: controller.signal }))
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const status = await response.json() as ProviderStatus[];
        setProviders(status);
        setConfiguredProviders(status.filter((provider) => provider.configured).length);
      })
      .catch(() => { if (!controller.signal.aborted) { setHealth((value) => value === "checking" ? "unavailable" : value); setPostgresHealth((value) => value === "checking" ? "unavailable" : value); setVectorHealth((value) => value === "checking" ? "unavailable" : value); setRedisHealth((value) => value === "checking" ? "unavailable" : value); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (postgresHealth !== "connected") return;
    const controller = new AbortController();
    fetch(`${API_URL}/conversations`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Histórico remoto indisponível");
        const remote = await response.json() as { id: string; title: string; agentId?: string | null; messages: { role: string; content: string }[]; updatedAt: string }[];
        setConversations((local) => {
          const localById = new Map(local.map((item) => [item.id, item]));
          const merged = remote.map((item) => {
            const saved = localById.get(item.id);
            const messages = item.messages.filter((message): message is ChatMessage => message.role === "user" || message.role === "assistant");
            return saved ? { ...saved, ...(typeof item.agentId === "string" ? { agentId: item.agentId } : {}), title: item.title || saved.title, messages: saved.messages.length >= messages.length ? saved.messages : messages, updatedAt: Math.max(saved.updatedAt, Date.parse(item.updatedAt) || 0) } : { id: item.id, title: item.title, messages, updatedAt: Date.parse(item.updatedAt) || Date.now(), ...(typeof item.agentId === "string" ? { agentId: item.agentId } : {}) };
          });
          const remoteIds = new Set(remote.map((item) => item.id));
          return [...merged, ...local.filter((item) => !remoteIds.has(item.id))].sort((a, b) => b.updatedAt - a.updatedAt);
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [postgresHealth]);

  useEffect(() => {
    if (postgresHealth === "checking") return;
    if (postgresHealth !== "connected") { setAgentPersistence("local"); return; }
    const controller = new AbortController();
    fetch(`${API_URL}/agents`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("A API de agentes não respondeu.");
        let remote = await response.json() as Agent[];
        const knownIds = new Set(remote.map((agent) => agent.id));
        let migrationFailed = false;
        for (const localAgent of readWorkspace().agents) {
          if (knownIds.has(localAgent.id)) continue;
          try {
            const created = await fetch(`${API_URL}/agents`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(localAgent) });
            if (!created.ok) throw new Error("Não foi possível migrar um agente local.");
            const saved = await created.json() as Agent;
            knownIds.add(saved.id);
            remote = [...remote, saved];
          } catch (cause) {
            if (controller.signal.aborted) throw cause;
            migrationFailed = true;
          }
        }
        setRemoteAgentIds([...knownIds]);
        setAgents((current) => {
          const merged = new Map(remote.map((agent) => [agent.id, agent]));
          // Keep any same-ID local record until the user explicitly saves changes.
          for (const agent of current) merged.set(agent.id, agent);
          return [...merged.values()];
        });
        setAgentPersistence(migrationFailed ? "error" : "connected");
      })
      .catch(() => { if (!controller.signal.aborted) setAgentPersistence("error"); });
    return () => controller.abort();
  }, [postgresHealth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, serializeWorkspace({ conversations, agents }));
  }, [conversations, agents]);
  useEffect(() => { localStorage.setItem("grupo-jadson.sidebar-collapsed", String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem("grupo-jadson.favorite-agents", JSON.stringify(favoriteAgentIds)); }, [favoriteAgentIds]);

  function newConversation(agentId?: string) {
    const conversation: Conversation = { id: crypto.randomUUID(), title: "Nova conversa", messages: [], updatedAt: Date.now(), ...(agentId ? { agentId } : {}) };
    setConversations((items) => [conversation, ...items]);
    setActiveConversation(conversation.id);
    setPage("chat");
    setError(null);
    setMobileOpen(false);
  }

  function openAgentProfile(id: string) { setViewedAgentId(id); setPage("agent-detail"); setMobileOpen(false); }

  function changePage(next: PageId) {
    setPage(next);
    setMobileOpen(false);
    if (next === "chat" && !activeConversation) newConversation();
  }

  async function sendMessage(contentInput: string, model: string, agent: Agent | undefined) {
    const content = contentInput.trim();
    if (!content || busy) return;
    let conversationId = activeConversation;
    if (!conversationId) {
      const conversation: Conversation = { id: crypto.randomUUID(), title: content.slice(0, 48), messages: [], updatedAt: Date.now() };
      conversationId = conversation.id;
      setActiveConversation(conversationId);
      setConversations((items) => [conversation, ...items]);
    }
    const id = conversationId;
    const userMessage: ChatMessage = { role: "user", content };
    const current = conversations.find((item) => item.id === id);
    const prior = current?.messages ?? [];
    setConversations((items) => items.map((item) => item.id === id ? { ...item, ...(agent ? { agentId: agent.id } : {}), title: item.messages.length ? item.title : content.slice(0, 48), messages: [...item.messages, userMessage], updatedAt: Date.now() } : item));
    setDraft(""); setFiles([]); setError(null); setBusy(true); setActiveAgentId(agent?.id ?? null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch(`${API_URL}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id, ...(agent ? { agentId: agent.id } : {}), messages: [...(agent?.instructions.trim() ? [{ role: "system", content: agent.instructions.trim() } as const] : []), ...prior, userMessage], ...(model.trim() ? { model: model.trim() } : {}) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `A API respondeu com HTTP ${response.status}.`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("A API não retornou um fluxo de resposta legível.");
      const decoder = new TextDecoder(); let answer = ""; let pending = "";
      setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: [...item.messages, { role: "assistant", content: "" }] } : item));
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim(); if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[]; content?: string };
            answer += parsed.choices?.[0]?.delta?.content ?? parsed.content ?? "";
            setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: item.messages.map((message, index) => index === item.messages.length - 1 && message.role === "assistant" ? { ...message, content: answer } : message), updatedAt: Date.now() } : item));
          } catch { /* ignore incomplete SSE frames */ }
        }
      }
      if (!answer) throw new Error("O provedor encerrou a resposta sem conteúdo.");
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      if (!aborted) setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: item.messages.filter((message) => message.role !== "assistant" || message.content.length > 0) } : item));
      if (!aborted) setError(cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem.");
    } finally { setBusy(false); setActiveAgentId(null); abortRef.current = null; }
  }

  async function persistAgent(agent: Agent) {
    if (postgresHealth !== "connected" || agentPersistence === "checking") return;
    const exists = remoteAgentIds.includes(agent.id);
    try {
      const response = await fetch(exists ? `${API_URL}/agents/${agent.id}` : `${API_URL}/agents`, {
        method: exists ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      });
      if (!response.ok) throw new Error("Não foi possível salvar o agente no PostgreSQL.");
      const saved = await response.json() as Agent;
      setRemoteAgentIds((ids) => ids.includes(saved.id) ? ids : [...ids, saved.id]);
      setAgents((items) => items.map((item) => item.id === agent.id ? saved : item));
      setAgentPersistence("connected");
    } catch { setAgentPersistence("error"); }
  }

  function toggleAgent(id: string) {
    const updated = agents.find((agent) => agent.id === id);
    if (!updated) return;
    const next = { ...updated, enabled: !updated.enabled };
    setAgents((items) => items.map((item) => item.id === id ? next : item));
    void persistAgent(next);
  }

  function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!agentEditor) return;
    const saved = agentEditor;
    setAgents((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
    void persistAgent(saved);
    setAgentEditor(null);
  }

  const viewedAgent = agents.find((agent) => agent.id === viewedAgentId) ?? null;
  const title = page === "agent-detail" ? viewedAgent?.name ?? "Perfil do agente" : [...NAV, ...SECONDARY_NAV, { id: "chat" as PageId, label: "Nova conversa", icon: MessageSquare }].find((item) => item.id === page)?.label ?? "Início";
  const serviceLabel = health === "connected" ? "API conectada" : health === "checking" ? "Verificando API" : "API indisponível";


  const visibleSidebarAgents = agents.filter((agent) => agent.name.toLocaleLowerCase().includes(agentSearch.trim().toLocaleLowerCase())).sort((a, b) => Number(favoriteAgentIds.includes(b.id)) - Number(favoriteAgentIds.includes(a.id))).slice(0, 6);
  function toggleFavoriteAgent(id: string) { setFavoriteAgentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  return (
    <div className={`app-shell flex min-h-dvh ${sidebarCollapsed ? "app-shell-collapsed" : ""}`}>
      <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Abrir menu"><Boxes size={19} /></button>
      {mobileOpen && <button className="scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="brand"><img src={logo} alt="Logo Grupo Jadson" /><div><strong>GRUPO JADSON</strong><span>AI AGENT PLATFORM</span></div><button className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expandir navegação" : "Recolher navegação"} title={sidebarCollapsed ? "Expandir navegação" : "Recolher navegação"}>{sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
        <button className="new-chat" onClick={newConversation} aria-label="Nova conversa"><Plus size={16} /><span>Nova conversa</span></button>
        <nav aria-label="Navegação principal">
          {NAV.map(({ id, label, icon: Icon }) => <button className={`nav-item ${page === id || (id === "conversations" && page === "chat") ? "active" : ""}`} key={id} onClick={() => changePage(id)} title={sidebarCollapsed ? label : undefined} aria-current={page === id ? "page" : undefined}><Icon size={17} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-agents"><span className="section-label">SEUS AGENTES</span>{!sidebarCollapsed && agents.length > 0 && <label className="sidebar-agent-search"><Search size={13} /><input value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder="Buscar agentes" aria-label="Buscar agentes" /></label>}{visibleSidebarAgents.map((agent) => <div key={agent.id} className="sidebar-agent-row"><button className="sidebar-agent" title={sidebarCollapsed ? agent.name + " · " + (activeAgentId === agent.id ? "Pensando" : agent.enabled ? "Ativado" : "Desativado") : undefined} onClick={() => agent.enabled && newConversation(agent.id)} disabled={!agent.enabled} aria-label={"Conversar com " + agent.name}><span className="agent-avatar">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span><span className="sidebar-agent-copy"><b>{agent.name}</b><small>{activeAgentId === agent.id ? "Pensando" : agent.enabled ? "Ativado" : "Desativado"}</small></span><i className={"agent-presence " + (activeAgentId === agent.id ? "thinking" : agent.enabled ? "enabled" : "")} aria-label={activeAgentId === agent.id ? "Pensando" : agent.enabled ? "Ativado" : "Desativado"} /></button>{!sidebarCollapsed && <button className={"favorite-agent " + (favoriteAgentIds.includes(agent.id) ? "is-favorite" : "")} onClick={() => toggleFavoriteAgent(agent.id)} aria-label={favoriteAgentIds.includes(agent.id) ? "Remover " + agent.name + " dos favoritos" : "Favoritar " + agent.name} aria-pressed={favoriteAgentIds.includes(agent.id)} title={favoriteAgentIds.includes(agent.id) ? "Remover dos favoritos" : "Favoritar agente"}><Star size={13} fill={favoriteAgentIds.includes(agent.id) ? "currentColor" : "none"} /></button>}</div>)}{agents.length === 0 && !sidebarCollapsed && <small className="sidebar-empty">Seus agentes aparecem aqui.</small>}{agents.length > 0 && visibleSidebarAgents.length === 0 && !sidebarCollapsed && <small className="sidebar-empty">Nenhum agente encontrado.</small>}</div>
        {conversations.length > 0 && <div className="history"><span className="section-label">CONVERSAS RECENTES</span>{conversations.slice(0, 5).map((item) => <button key={item.id} className={`history-item ${activeConversation === item.id ? "history-active" : ""}`} onClick={() => { setActiveConversation(item.id); setPage("chat"); setMobileOpen(false); }}><MessageSquare size={13} /><span>{item.title}</span></button>)}</div>}
        <div className="sidebar-secondary">{SECONDARY_NAV.map(({ id, label, icon: Icon }) => <button className={`nav-item ${page === id ? "active" : ""}`} key={id} onClick={() => changePage(id)} title={sidebarCollapsed ? label : undefined}><Icon size={16} /><span>{label}</span></button>)}</div>
        <div className="sidebar-bottom"><span className={`connection-dot ${health}`} /><span>{health === "connected" ? "Backend conectado" : health === "checking" ? "Conferindo serviços…" : "Backend desconectado"}</span></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{title}</b></div><div className={`status status-${health}`}><i />{serviceLabel}</div></header>
        {page === "dashboard" && <Dashboard health={health} postgresHealth={postgresHealth} vectorHealth={vectorHealth} redisHealth={redisHealth} configuredProviders={configuredProviders} agents={agents} conversations={conversations} busy={busy} activeAgentName={agents.find((agent) => agent.id === activeAgentId)?.name} onNavigate={changePage} onStartTask={(task, agentId) => { setDraft(task); newConversation(agentId); }} onOpenConversation={(id) => { setActiveConversation(id); setPage("chat"); }} />}
        {page === "chat" && <ChatPage conversation={active} agents={agents} draft={draft} busy={busy} activeAgentId={activeAgentId} error={error} files={files} setDraft={setDraft} setFiles={setFiles} onSend={sendMessage} onCancel={() => abortRef.current?.abort()} onDismissError={() => setError(null)} onChooseFiles={() => inputRef.current?.click()} inputRef={inputRef} />}
        {page === "agents" && <AgentsPage agents={agents} remoteAgentIds={remoteAgentIds} persistence={agentPersistence} onCreate={() => setAgentEditor({ id: crypto.randomUUID(), name: "", description: "", instructions: "", model: "", enabled: true })} onEdit={setAgentEditor} onToggle={toggleAgent} onChat={(id) => newConversation(id)} onOpen={openAgentProfile} />}
        {page === "agent-detail" && viewedAgent && <AgentDetailPage agent={viewedAgent} conversations={conversations} persistence={agentPersistence} onBack={() => setPage("agents")} onEdit={() => setAgentEditor(viewedAgent)} onChat={() => newConversation(viewedAgent.id)} onOpenConversation={(id) => { setActiveConversation(id); setPage("chat"); }} />}
        {page === "conversations" && <ConversationsPage conversations={conversations} agents={agents} onNew={newConversation} onOpen={(id) => { setActiveConversation(id); setPage("chat"); }} />}
        {page === "models" && <ModelsPage providers={providers} onOpenChat={() => changePage("chat")} />}
        {page === "settings" && <SettingsPage providers={providers} />}
        {page === "monitoring" && <MonitoringPage health={health} postgres={postgresHealth} vector={vectorHealth} redis={redisHealth} providerCount={configuredProviders} />}
        {!(["dashboard", "chat", "agents", "agent-detail", "conversations", "models", "settings", "monitoring"] as PageId[]).includes(page) && <ComingSoonPage page={page} onNavigate={changePage} />}
      </main>
      {agentEditor && <AgentModal agent={agentEditor} onChange={setAgentEditor} onClose={() => setAgentEditor(null)} onSubmit={saveAgent} />}
    </div>
  );
}

function Dashboard({ health, postgresHealth, vectorHealth, redisHealth, configuredProviders, agents, conversations, busy, activeAgentName, onNavigate, onStartTask, onOpenConversation }: { health: Health; postgresHealth: Health; vectorHealth: Health; redisHealth: Health; configuredProviders: number | null; agents: Agent[]; conversations: Conversation[]; busy: boolean; activeAgentName?: string; onNavigate: (page: PageId) => void; onStartTask: (task: string, agentId?: string) => void; onOpenConversation: (id: string) => void }) {
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("");
  const recent = conversations.slice(0, 3);
  const selectedAgent = agents.find((agent) => agent.id === agentId && agent.enabled);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia, Jadson." : hour < 18 ? "Boa tarde, Jadson." : "Boa noite, Jadson.";
  function startTask(value = task) {
    const next = value.trim();
    if (!next) return;
    setTask("");
    onStartTask(next, selectedAgent?.id);
  }
  return <div className="page-content dashboard-page workspace-home">
    <section className="home-intro"><div><p className="eyebrow"><Sparkles size={14} /> SEU ESPAÇO DE TRABALHO</p><h1>{greeting}</h1><p className="muted text-pretty">Que trabalho vamos avançar hoje?</p></div><div className={"home-presence " + (busy ? "is-working" : "")}><i />{busy ? "Em execução" + (activeAgentName ? " · " + activeAgentName : "") : health === "connected" ? "Workspace pronto" : "Modo local"}</div></section>
    <section className="task-launcher" aria-label="Iniciar tarefa"><div className="task-launcher-top"><span className="task-launcher-mark"><Sparkles size={18} /></span><div><strong>Comece por aqui</strong><span>Descreva o que você precisa. A solicitação será enviada pelo chat.</span></div></div><form className="task-launcher-form" onSubmit={(event) => { event.preventDefault(); startTask(); }}><textarea value={task} onChange={(event) => setTask(event.target.value)} rows={2} placeholder="Peça ao Grupo Jadson para ajudar com uma tarefa…" aria-label="Descreva sua tarefa" /><div className="task-launcher-actions"><label className="agent-picker"><Bot size={15} /><select aria-label="Agente para a tarefa" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Escolher agente (opcional)</option>{agents.filter((agent) => agent.enabled).map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select><ChevronDown size={13} /></label><button className="task-submit" type="submit" disabled={!task.trim()}><span>Iniciar tarefa</span><ArrowUpRight size={16} /></button></div></form><div className="task-suggestions"><span>Sugestões</span>{["Resumir um texto", "Planejar uma tarefa", "Explorar uma ideia"].map((suggestion) => <button key={suggestion} onClick={() => startTask(suggestion)}>{suggestion}<ArrowUpRight size={12} /></button>)}</div></section>
    <div className="home-columns"><section className="home-section team-section"><div className="home-section-heading"><div><span className="section-label">SUA EQUIPE</span><h2>Agentes</h2></div><button className="text-button" onClick={() => onNavigate("agents")}>Ver todos <ArrowUpRight size={14} /></button></div>{agents.length === 0 ? <div className="home-empty"><Bot size={18} /><span>Nenhum agente configurado ainda.</span><button onClick={() => onNavigate("agents")}>Criar agente <Plus size={14} /></button></div> : <div className="home-agent-list">{agents.slice(0, 4).map((agent) => <button className="home-agent" key={agent.id} onClick={() => { if (!agent.enabled) return; setAgentId(agent.id); document.querySelector<HTMLTextAreaElement>(".task-launcher-form textarea")?.focus(); }} disabled={!agent.enabled} title={agent.enabled ? "Selecionar no início de tarefa" : agent.name + " está desativado"}><span className="agent-avatar">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span><span className="home-agent-copy"><b>{agent.name}</b><small>{agent.description || "Agente pessoal"}</small></span><span className={"status-tag " + (agent.enabled ? "configured" : "disabled")}><i />{agent.enabled ? "Ativado" : "Desativado"}</span></button>)}</div>}</section>
      <section className="home-section execution-section"><div className="home-section-heading"><div><span className="section-label">AGORA</span><h2>Execução</h2></div><ListTodo size={17} /></div>{busy ? <button className="execution-item" onClick={() => onNavigate("chat")}><span className="execution-indicator"><LoaderCircle className="spin" size={16} /></span><span><b>{activeAgentName ? activeAgentName + " está trabalhando" : "Resposta em andamento"}</b><small>Streaming ativo nesta conversa</small></span><ArrowUpRight size={14} /></button> : <div className="execution-empty"><span className="execution-indicator"><Clock3 size={15} /></span><span><b>Nenhuma tarefa em execução</b><small>Uma execução aparecerá aqui quando o chat estiver gerando uma resposta.</small></span></div>}</section></div>
    <div className="home-columns home-columns-lower"><section className="home-section recent-section"><div className="home-section-heading"><div><span className="section-label">RETOMAR</span><h2>Conversas recentes</h2></div><button className="text-button" onClick={() => onNavigate("conversations")}>Histórico <ArrowUpRight size={14} /></button></div>{recent.length === 0 ? <div className="home-empty"><MessageSquare size={17} /><span>Suas conversas salvas aparecerão aqui.</span><button onClick={() => onNavigate("chat")}>Abrir chat <ArrowUpRight size={13} /></button></div> : recent.map((conversation) => <button className="home-conversation" key={conversation.id} onClick={() => onOpenConversation(conversation.id)}><span className="conversation-card-icon"><MessageSquare size={15} /></span><span><b>{conversation.title || "Nova conversa"}</b><small>{conversation.messages.length} mensagens · {new Date(conversation.updatedAt).toLocaleDateString()}</small></span><ArrowUpRight size={14} /></button>)}</section>
      <section className="home-section services-section"><div className="home-section-heading"><div><span className="section-label">CONECTIVIDADE</span><h2>Serviços</h2></div><button className="text-button" onClick={() => onNavigate("monitoring")}>Detalhes <ArrowUpRight size={14} /></button></div><ServiceRow name="API NestJS" detail={health === "connected" ? "Verificação confirmada" : "Sem conexão confirmada"} status={health} /><ServiceRow name="PostgreSQL" detail={postgresHealth === "connected" ? "Conectado" : "Não conectado"} status={postgresHealth} /><ServiceRow name="pgvector" detail={vectorHealth === "connected" ? "Conectado" : "Não conectado"} status={vectorHealth} /><ServiceRow name="Redis" detail={redisHealth === "connected" ? "Conectado" : "Não conectado"} status={redisHealth} /><div className="service-row provider-config-row"><span className="provider-config-mark" /><div><b>Provedor de IA</b><small>{configuredProviders === null ? "Ainda não verificado" : configuredProviders > 0 ? configuredProviders + " configurado(s)" : "Nenhum configurado"}</small></div><span className="provider-config-state">{configuredProviders === null ? "Verificando" : configuredProviders > 0 ? "Configurado" : "Pendente"}</span></div></section></div>
  </div>;
}

function ServiceRow({ name, detail, status }: { name: string; detail: string; status: Health }) { return <div className="service-row"><span className={`connection-dot ${status}`} /><div><b>{name}</b><small>{detail}</small></div><span className={`service-state ${status}`}>{status === "connected" ? "Conectado" : status === "checking" ? "Verificando" : "Pendente"}</span></div>; }

function ProviderCredentialRow({ name, detail, configured }: { name: string; detail: string; configured: boolean }) {
  return <div className="service-row provider-config-row"><span className={"provider-config-mark " + (configured ? "is-configured" : "")} /><div><b>{name}</b><small>{detail}</small></div><span className="provider-config-state">{configured ? "Configurado" : "Não configurado"}</span></div>;
}

function ConversationsPage({ conversations, agents, onNew, onOpen }: { conversations: Conversation[]; agents: Agent[]; onNew: () => void; onOpen: (id: string) => void }) {
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  return <div className="page-content conversations-page">
    <div className="page-title-row"><div><span className="section-label">SEU HISTÓRICO</span><h1>Conversas</h1><p className="muted text-pretty">Retome um diálogo salvo neste dispositivo ou no PostgreSQL quando conectado.</p></div><button className="primary" onClick={onNew}><Plus size={15} /> Nova conversa</button></div>
    {conversations.length === 0 ? <EmptyState title="Sua próxima conversa começa aqui" text="As conversas aparecem neste espaço depois que você iniciar um chat." action={<button className="secondary" onClick={onNew}><MessageSquare size={14} /> Começar conversa</button>} /> : <div className="conversation-list">{conversations.map((conversation) => <button className="conversation-card" key={conversation.id} onClick={() => onOpen(conversation.id)}><span className="conversation-card-icon"><MessageSquare size={17} /></span><span className="conversation-card-copy"><b>{conversation.title || "Nova conversa"}</b><small>{conversation.messages.length} mensagens · {agentNames.get(conversation.agentId ?? "") ?? "Sem agente associado"}</small></span><span className="conversation-date">{new Date(conversation.updatedAt).toLocaleDateString()}</span><ChevronDown className="conversation-open-icon" size={16} /></button>)}</div>}
    <p className="conversation-storage-note"><ShieldCheck size={14} /> Conversas e associação ao agente são sincronizadas com PostgreSQL quando o backend está disponível; o desktop mantém cópia local.</p>
  </div>;
}

function ChatPage({ conversation, agents, draft, busy, activeAgentId, error, files, setDraft, setFiles, onSend, onCancel, onDismissError, onChooseFiles, inputRef }: { conversation: Conversation | null; agents: Agent[]; draft: string; busy: boolean; activeAgentId: string | null; error: string | null; files: File[]; setDraft: (value: string) => void; setFiles: (value: File[]) => void; onSend: (content: string, model: string, agent: Agent | undefined) => void; onCancel: () => void; onDismissError: () => void; onChooseFiles: () => void; inputRef: RefObject<HTMLInputElement> }) {
  const [model, setModel] = useState("");
  const [agentId, setAgentId] = useState(conversation?.agentId ?? "");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  useEffect(() => { setAgentId(conversation?.agentId ?? ""); }, [conversation?.id, conversation?.agentId]);
  const selectedAgent = agents.find((agent) => agent.id === agentId && agent.enabled);
  const runningAgent = agents.find((agent) => agent.id === activeAgentId);

  return <div className={"chat-page " + (workspaceOpen ? "chat-workspace-open" : "")}>
    <div className="chat-heading">
      <div className="chat-title"><span className="section-label">CONVERSA</span><h1>{conversation?.title ?? "Nova conversa"}</h1></div>
      <div className="chat-heading-actions">
        <div className="chat-context"><span>MODELO</span><b>{model.trim() || "Padrão do provedor"}</b><span>AGENTE</span><b>{selectedAgent?.name ?? "Nenhum"}</b></div>
        <button className={"workspace-toggle " + (workspaceOpen ? "selected" : "")} onClick={() => setWorkspaceOpen((open) => !open)} aria-expanded={workspaceOpen} aria-controls="chat-workspace"><PanelRight size={16} /><span>Workspace</span></button>
      </div>
    </div>
    <div className="messages-area">
      {!conversation?.messages.length ? <div className="chat-empty"><img src={logo} alt="" /><span className="section-label">GRUPO JADSON</span><h2>O que vamos construir hoje?</h2><p>As respostas vêm do backend. Configure um provedor de IA para começar.</p><div className="suggestions"><button onClick={() => setDraft("Quais serviços estão conectados?")}>Verificar os serviços</button><button onClick={() => setDraft("Quais agentes estão configurados?")}>Consultar meus agentes</button></div></div> : <div className="message-list">{conversation.messages.map((message, index) => <div className={"message message-" + message.role} key={index + "-" + message.role}><span className="message-avatar">{message.role === "user" ? "J" : <img src={logo} alt="Grupo Jadson" />}</span><div className="message-body"><b>{message.role === "user" ? "Você" : "Grupo Jadson"}</b><div className="message-content">{message.content ? <MarkdownContent content={message.content} /> : (busy ? <LoaderCircle className="spin" size={15} /> : "")}</div></div></div>)}</div>}
    </div>
    <div className="composer-wrap">
      {error && <div className="inline-error" role="alert"><CircleHelp size={15} /><span>{error}</span><button onClick={onDismissError} aria-label="Fechar erro"><X size={14} /></button></div>}
      {files.length > 0 && <div className="attachment-list">{files.map((file) => <span key={file.name + "-" + file.size}><Paperclip size={12} />{file.name}<button onClick={() => setFiles(files.filter((item) => item !== file))} aria-label={"Remover anexo " + file.name}><X size={12} /></button></span>)}</div>}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSend(draft, model, selectedAgent); }}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem…" rows={2} aria-label="Mensagem" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="composer-tools"><div><input ref={inputRef} hidden type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx" onChange={(event) => setFiles([...files, ...Array.from(event.target.files ?? [])])} /><button type="button" className="icon-button" onClick={onChooseFiles} title="Anexar arquivos" aria-label="Anexar arquivos"><Paperclip size={16} /></button><input className="model-input" aria-label="ID do modelo" placeholder="Modelo padrão" value={model} onChange={(event) => setModel(event.target.value)} /><select className="agent-select" aria-label="Agente" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Sem agente</option>{agents.filter((agent) => agent.enabled).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><span>Enter envia · Shift+Enter quebra linha</span></div>{busy ? <button type="button" className="send-button stop-button" onClick={onCancel} title="Cancelar geração" aria-label="Cancelar geração"><Square size={14} /></button> : <button type="submit" className="send-button" disabled={!draft.trim()} title="Enviar mensagem" aria-label="Enviar mensagem"><Send size={15} /></button>}</div>
      </form>
      <p className="composer-note">As conversas são salvas localmente e no PostgreSQL quando conectado. Anexos ainda não são enviados ao backend.</p>
    </div>
    {workspaceOpen && <aside className="chat-workspace-panel" id="chat-workspace" aria-label="Workspace da conversa">
      <div className="workspace-panel-heading"><div><span className="section-label">CONTEXTO DA CONVERSA</span><h2>Workspace</h2></div><button className="icon-button" onClick={() => setWorkspaceOpen(false)} aria-label="Fechar workspace"><X size={16} /></button></div>
      <div className="workspace-run-state"><span className={"run-state-dot " + (busy ? "working" : "idle")} /><div><b>{busy ? "Resposta em andamento" : "Nenhuma execução ativa"}</b><small>{busy ? "O backend está transmitindo conteúdo para esta conversa." : "O painel reflete apenas o estado disponível no app."}</small></div></div>
      <div className="workspace-fact"><span>Conversa</span><b>{conversation?.title || "Nova conversa"}</b></div>
      <div className="workspace-fact"><span>Agente</span><b>{busy && runningAgent ? runningAgent.name : selectedAgent?.name ?? "Nenhum selecionado"}</b></div>
      <div className="workspace-fact"><span>Mensagens</span><b>{conversation?.messages.length ?? 0}</b></div>
      <div className="workspace-unavailable"><ShieldCheck size={15} /><p>Eventos de ferramentas, arquivos acessados, logs e aprovações ainda não são fornecidos pela API atual.</p></div>
    </aside>}
  </div>;
}

function AgentsPage({ agents, remoteAgentIds, persistence, onCreate, onEdit, onToggle, onChat, onOpen }: { agents: Agent[]; remoteAgentIds: string[]; persistence: "checking" | "connected" | "local" | "error"; onCreate: () => void; onEdit: (agent: Agent) => void; onToggle: (id: string) => void; onChat: (id: string) => void; onOpen: (id: string) => void }) {
  const persistenceMessage = persistence === "connected" ? "PostgreSQL confirmado. Alterações são enviadas ao salvar; os dados locais permanecem preservados." : persistence === "checking" ? "Verificando a persistência no backend. Os dados atuais continuam salvos localmente." : persistence === "error" ? "Não foi possível concluir a sincronização. As alterações permanecem no armazenamento local." : "PostgreSQL indisponível. Os perfis ficam no armazenamento local deste desktop.";
  return <div className="page-content"><div className="page-title-row"><div><span className="section-label">EQUIPE PESSOAL</span><h1>Meus agentes</h1><p className="muted text-pretty">Perfis persistentes com identidade, instruções e modelo preferido.</p></div><button className="primary" onClick={onCreate}><Plus size={15} /> Criar agente</button></div><div className="notice"><ShieldCheck size={16} /><span>{persistenceMessage}</span></div>{agents.length === 0 ? <EmptyState title="Monte sua equipe de agentes" text="Crie um perfil com identidade e instruções. Ele ficará disponível para seleção no chat." action={<button className="secondary" onClick={onCreate}><Plus size={14} /> Criar primeiro agente</button>} /> : <div className="agent-grid">{agents.map((agent) => <article className="panel agent-card" key={agent.id}><div className="agent-card-top"><div className="agent-identity"><span className="agent-avatar agent-avatar-large">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span><span className="agent-state"><i className={agent.enabled ? "agent-presence enabled" : "agent-presence"} />{agent.enabled ? "Ativado" : "Desativado"}</span></div><button className={"toggle " + (agent.enabled ? "toggle-on" : "")} aria-label={agent.enabled ? "Desativar agente" : "Ativar agente"} aria-pressed={agent.enabled} onClick={() => onToggle(agent.id)}><span /></button></div><button className="agent-profile-link" onClick={() => onOpen(agent.id)}><h2>{agent.name}</h2><ArrowUpRight size={15} /></button><p>{agent.description || "Sem descrição"}</p><div className="agent-meta"><span>{agent.model || "Modelo padrão"}</span><span>{remoteAgentIds.includes(agent.id) ? "PostgreSQL" : "Apenas local"}</span></div><div className="agent-card-actions"><button className="secondary" onClick={() => onEdit(agent)}>Editar</button><button className="secondary" onClick={() => onOpen(agent.id)}>Perfil</button><button className="primary" disabled={!agent.enabled} onClick={() => onChat(agent.id)}><MessageSquare size={14} /> Conversar</button></div></article>)}</div>}</div>;
}

function AgentDetailPage({ agent, conversations, persistence, onBack, onEdit, onChat, onOpenConversation }: { agent: Agent; conversations: Conversation[]; persistence: "checking" | "connected" | "local" | "error"; onBack: () => void; onEdit: () => void; onChat: () => void; onOpenConversation: (id: string) => void }) {
  const history = conversations.filter((conversation) => conversation.agentId === agent.id);
  const persistenceLabel = persistence === "connected" ? "Sincronização conectada" : persistence === "checking" ? "Verificando sincronização" : persistence === "error" ? "Falha na sincronização; cópia local preservada" : "Armazenado localmente";
  return <div className="page-content agent-detail-page">
    <button className="back-link" onClick={onBack}><ChevronLeft size={15} /> Todos os agentes</button>
    <section className="agent-detail-hero"><div className="agent-detail-avatar">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</div><div className="agent-detail-identity"><span className="section-label">PERFIL DO AGENTE</span><h1>{agent.name}</h1><p>{agent.description || "Este agente ainda não tem uma descrição."}</p><span className={"agent-detail-state " + (agent.enabled ? "enabled" : "")}><i />{agent.enabled ? "Ativado para seleção no chat" : "Desativado"}</span></div><div className="agent-detail-actions"><button className="secondary" onClick={onEdit}>Editar perfil</button><button className="primary" disabled={!agent.enabled} onClick={onChat}><MessageSquare size={14} /> Nova conversa</button></div></section>
    <div className="agent-detail-grid"><section className="home-section"><div className="home-section-heading"><div><span className="section-label">CONFIGURAÇÃO</span><h2>Modelo e instruções</h2></div><BrainCircuit size={17} /></div><div className="workspace-fact"><span>Modelo preferido</span><b>{agent.model || "Padrão do provedor"}</b></div><div className="agent-instructions"><span>Instruções de sistema</span><p>{agent.instructions.trim() || "Nenhuma instrução personalizada foi definida."}</p></div><div className="agent-persistence"><ShieldCheck size={14} />{persistenceLabel}</div></section>
      <section className="home-section"><div className="home-section-heading"><div><span className="section-label">CAPACIDADES</span><h2>Memória e ferramentas</h2></div><ShieldCheck size={17} /></div><div className="capability-row"><BrainCircuit size={15} /><span><b>Memória individual</b><small>Indisponível na API atual</small></span><span className="capability-state">Em desenvolvimento</span></div><div className="capability-row"><FolderOpen size={15} /><span><b>Ferramentas autorizadas</b><small>Não fornecidas pela API atual</small></span><span className="capability-state">Em desenvolvimento</span></div><p className="agent-detail-note">O estado ativado controla a seleção deste perfil no chat. Ele não indica uma execução ativa.</p></section>
    </div>
    <section className="home-section agent-history"><div className="home-section-heading"><div><span className="section-label">HISTÓRICO DISPONÍVEL</span><h2>Conversas deste agente</h2></div><span className="history-count">{history.length}</span></div>{history.length === 0 ? <EmptyState title="Nenhuma conversa associada" text="As conversas iniciadas com este agente aparecerão aqui." action={<button className="secondary" disabled={!agent.enabled} onClick={onChat}><MessageSquare size={14} /> Iniciar conversa</button>} /> : history.slice(0, 8).map((conversation) => <button className="home-conversation" key={conversation.id} onClick={() => onOpenConversation(conversation.id)}><span className="conversation-card-icon"><MessageSquare size={15} /></span><span><b>{conversation.title || "Nova conversa"}</b><small>{conversation.messages.length} mensagens · {new Date(conversation.updatedAt).toLocaleDateString()}</small></span><ArrowUpRight size={14} /></button>)}</section>
  </div>;
}

function ModelsPage({ providers, onOpenChat }: { providers: ProviderStatus[] | null; onOpenChat: () => void }) {
  return <div className="page-content"><div className="page-title-row"><div><span className="section-label">GATEWAY DE IA</span><h1>Modelos de IA</h1><p className="muted">Estado consultado ao backend; as credenciais não são expostas nesta tela.</p></div><button className="primary" onClick={onOpenChat}><MessageSquare size={15} /> Abrir chat</button></div>{providers === null ? <EmptyState title="Backend não consultado" text="Conecte o backend para verificar quais provedores estão configurados." /> : <div className="provider-grid">{providers.map((provider) => <article className="panel provider-card" key={provider.id}><div className="panel-icon"><BrainCircuit size={20} /></div><span className="section-label">PROVEDOR</span><h2>{provider.name}</h2><ProviderCredentialRow name="Credenciais" detail={provider.configured ? "Chave detectada pelo backend" : "Chave ausente no ambiente do backend"} configured={provider.configured} /><p>{provider.configured ? "O backend pode encaminhar chamadas a este provedor. O modelo pode ser informado no chat ou definido no ambiente." : "Configure a chave no arquivo .env do projeto e reinicie o backend. A chave não deve ser inserida no frontend."}</p></article>)}</div>}</div>;
}

function SettingsPage({ providers }: { providers: ProviderStatus[] | null }) {
  return <div className="page-content"><div className="page-title-row"><div><span className="section-label">PREFERÊNCIAS</span><h1>Configurações</h1><p className="muted">Configuração segura dos serviços locais.</p></div></div><article className="panel settings-card"><div className="panel-heading"><div><span className="section-label">CHAVES DE PROVEDORES</span><h2>Credenciais do backend</h2></div><ShieldCheck size={18} /></div><p>As chaves de API ficam no ambiente do backend e nunca são enviadas ao bundle do desktop. Copie .env.example para .env, configure OPENAI_API_KEY e reinicie a API.</p><div className="notice"><FileText size={16} /><span>Arquivo esperado: <code>.env</code> na raiz do projeto. Não compartilhe nem versione esse arquivo.</span></div><div className="provider-configuration">{providers === null ? <ServiceRow name="Estado do provedor" detail="Backend ainda não consultado" status="checking" /> : providers.map((provider) => <ProviderCredentialRow key={provider.id} name={provider.name} detail={provider.configured ? "Credencial presente no ambiente da API" : "Credencial ausente"} configured={provider.configured} />)}</div></article><article className="panel settings-card"><span className="section-label">ARMAZENAMENTO</span><h2>Conversas e agentes</h2><p>O desktop mantém uma cópia local de segurança. Conversas podem ser salvas no PostgreSQL; agentes são consultados e escritos pela API quando o banco e a rota respondem.</p></article></div>;
}

function MonitoringPage({ health, postgres, vector, redis, providerCount }: { health: Health; postgres: Health; vector: Health; redis: Health; providerCount: number | null }) {
  return <div className="page-content"><div className="page-title-row"><div><span className="section-label">OBSERVABILIDADE</span><h1>Monitoramento</h1><p className="muted">Estados verificados pelo backend ao abrir o aplicativo.</p></div></div><article className="panel service-panel"><ServiceRow name="API NestJS" detail="GET /health" status={health} /><ServiceRow name="PostgreSQL" detail="Conexão validada pelo backend" status={postgres} /><ServiceRow name="pgvector" detail="Extensão detectada no PostgreSQL" status={vector} /><ServiceRow name="Redis" detail="PING enviado pelo backend" status={redis} />{providerCount === null ? <ServiceRow name="Provedores configurados" detail="Não verificado" status="checking" /> : <ProviderCredentialRow name="Provedores de IA" detail={providerCount + " credencial(is) configurada(s) no backend"} configured={providerCount > 0} />}</article></div>;
}

function AgentModal({ agent, onChange, onClose, onSubmit }: { agent: Agent; onChange: (agent: Agent) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="agent-modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="section-label">PERFIL DO AGENTE</span><h2>{agent.name ? "Editar agente" : "Novo agente"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div><label>Nome<input required autoFocus value={agent.name} onChange={(event) => onChange({ ...agent, name: event.target.value })} placeholder="Ex.: Analista de pesquisa" /></label><label>Descrição<input value={agent.description} onChange={(event) => onChange({ ...agent, description: event.target.value })} placeholder="Especialidade e objetivo" /></label><label>Instruções<textarea rows={5} value={agent.instructions} onChange={(event) => onChange({ ...agent, instructions: event.target.value })} placeholder="Defina como o agente deve trabalhar" /></label><label>Modelo preferido<input value={agent.model} onChange={(event) => onChange({ ...agent, model: event.target.value })} placeholder="Será validado ao configurar um provedor" /></label><div className="modal-note"><ShieldCheck size={15} /> Ferramentas e memória ainda não possuem execução nesta versão.</div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="submit" className="primary"><Check size={14} /> Salvar agente</button></div></form></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><MessageSquare size={19} /></div><h3>{title}</h3><p>{text}</p>{action}</div>; }
function ComingSoonPage({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) { const item = [...NAV, ...SECONDARY_NAV].find((nav) => nav.id === page); const Icon = item?.icon ?? CircleHelp; return <div className="page-content placeholder-page"><div className="panel placeholder-card"><div className="panel-icon"><Icon size={22} /></div><span className="section-label">MÓDULO PLANEJADO</span><h1>{item?.label}</h1><p>Esta área ainda não possui operações implementadas. Nenhum serviço é apresentado como conectado sem verificação.</p><button className="secondary" onClick={() => onNavigate("dashboard")}><Gauge size={15} /> Voltar ao início</button></div></div>; }

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let code: string[] = [];
  let inCode = false;
  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      if (inCode) { blocks.push(<pre className="code-block" key={`code-${index}`}><code>{code.join("\n")}</code></pre>); code = []; inCode = false; }
      else inCode = true;
      return;
    }
    if (inCode) { code.push(line); return; }
    if (!line.trim()) { blocks.push(<br key={`break-${index}`} />); return; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { blocks.push(<strong className="markdown-heading" key={`heading-${index}`}>{inlineMarkdown(heading[2] ?? "")}</strong>); return; }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) { blocks.push(<div className="markdown-bullet" key={`bullet-${index}`}><span>•</span>{inlineMarkdown(bullet[1] ?? "")}</div>); return; }
    blocks.push(<span key={`line-${index}`}>{inlineMarkdown(line)}<br /></span>);
  });
  if (inCode) blocks.push(<pre className="code-block" key="code-open"><code>{code.join("\n")}</code></pre>);
  return <>{blocks}</>;
}

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code className="inline-code" key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}
