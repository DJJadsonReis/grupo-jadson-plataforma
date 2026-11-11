import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { parseWorkspace, serializeWorkspace, type Agent, type ChatMessage, type Conversation, type Group } from "./lib/workspace";
import {
  Activity, ArrowUp, ArrowUpRight, Bot, Boxes, BrainCircuit, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Cpu, FileText, FolderOpen, Gauge, Layers, ListTodo, LoaderCircle, MessageSquare, Paperclip,
  PanelRight, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Square, Star, Workflow, X, Maximize2, Minimize2
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import logo from "./assets/grupo-jadson-logo.png";

type PageId = "dashboard" | "chat" | "agents" | "agent-detail" | "conversations" | "groups" | "computers" | "memory" | "automations" | "tools" | "models" | "files" | "activity" | "monitoring" | "settings";
type Health = "checking" | "connected" | "unavailable";
type ProviderStatus = { id: string; name: string; configured: boolean };

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3333/api/v1";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "";

const SESSION_KEY = "grupo-jadson.session.v1";

/** Sessão da pessoa que entrou com a conta. Fica só neste computador. */
function readSession(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSession(token: string): void {
  try {
    window.localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* sem armazenamento: a sessão vale só nesta janela */
  }
}

/** Envia a sessão (se houver) ou o token do sistema em todas as chamadas ao backend. */
function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readSession() ?? API_TOKEN;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

const SIGN_IN_MESSAGES: Record<string, string> = {
  sem_acesso: "Seu e-mail ainda não está cadastrado. Peça ao administrador para liberar seu acesso.",
  cancelado: "A entrada foi cancelada.",
  falhou: "Não foi possível concluir a entrada. Tente de novo.",
  provedor_indisponivel: "Este provedor não está disponível agora.",
  "tempo esgotado": "A entrada demorou demais. Tente de novo.",
};

/** Tela de entrada: aparece só quando há provedores configurados e nenhuma sessão salva. */
function LoginScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/auth/providers`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("providers"))))
      .then((list: { id: string; label: string }[]) => setProviders(list))
      .catch(() => setError("Não foi possível falar com o servidor."));
  }, []);

  async function signIn(id: string) {
    setBusy(id);
    setError(null);
    try {
      // O retorno vai para um endereço local do próprio computador, aberto só durante a entrada.
      const port = await invoke<number>("begin_sign_in");
      const returnUri = encodeURIComponent(`http://127.0.0.1:${port}/cb`);
      await invoke("open_external", { url: `${API_URL}/auth/login/${id}?return=${returnUri}` });
      const token = await invoke<string>("await_sign_in");
      onSignedIn(token);
    } catch (reason) {
      const code = typeof reason === "string" ? reason : "";
      setError(SIGN_IN_MESSAGES[code] ?? "Não foi possível concluir a entrada. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-card">
        <img src={logo} alt="" className="login-logo" />
        <h1>Entrar no Grupo Jadson</h1>
        <p>Use a mesma conta cadastrada para você no sistema.</p>
        {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
        {providers.map((provider) => (
          <button key={provider.id} className="btn-primary-gold login-button" onClick={() => void signIn(provider.id)} disabled={busy !== null}>
            {busy === provider.id ? "Aguardando o navegador..." : `Entrar com ${provider.label}`}
          </button>
        ))}
      </div>
    </main>
  );
}

/** Decide se mostra a entrada. Sem provedores configurados, o app segue como antes. */
const SIGN_IN_REQUIRED_KEY = "grupo-jadson.signin-required.v1";

/** Lembra, neste computador, se a entrada com conta já foi exigida. Permite decidir na abertura, sem esperar a rede. */
function readSignInRequired(): boolean {
  try {
    return window.localStorage.getItem(SIGN_IN_REQUIRED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSignInRequired(required: boolean): void {
  try {
    window.localStorage.setItem(SIGN_IN_REQUIRED_KEY, required ? "1" : "0");
  } catch {
    /* sem armazenamento: a verificação acontece de novo na próxima abertura */
  }
}

/**
 * A janela abre na hora. Se a entrada com conta for exigida e não houver sessão, mostra a tela de entrada.
 * Sem provedores configurados, ou com o backend fora do ar, o app segue como antes.
 */
export default function App() {
  const [session, setSession] = useState<string | null>(() => readSession());
  const [needsLogin, setNeedsLogin] = useState<boolean>(() => readSignInRequired() && !readSession());

  useEffect(() => {
    fetch(`${API_URL}/auth/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((list: unknown[] | null) => {
        if (!list) return;
        const required = list.length > 0;
        writeSignInRequired(required);
        setNeedsLogin(required && !readSession());
      })
      .catch(() => { /* backend fora do ar: mantém o que já sabíamos */ });
  }, [session]);

  if (needsLogin) {
    return (
      <LoginScreen
        onSignedIn={(token) => {
          saveSession(token);
          setSession(token);
          setNeedsLogin(false);
        }}
      />
    );
  }
  return <Workspace />;
}

const NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "Início", icon: Gauge },
  { id: "agents", label: "Galeria de Agentes", icon: Bot },
  { id: "conversations", label: "Conversas", icon: MessageSquare },
  { id: "groups", label: "Grupos de agentes", icon: Boxes },
  { id: "automations", label: "Rotinas", icon: Workflow },
  { id: "tools", label: "Ferramentas", icon: FolderOpen },
  { id: "memory", label: "Memória", icon: BrainCircuit },
  { id: "files", label: "Arquivos", icon: FileText },
  { id: "activity", label: "Atividades", icon: Activity },
];

const SECONDARY_NAV: { id: PageId; label: string; icon: typeof Gauge }[] = [
  { id: "models", label: "Modelos e provedores", icon: BrainCircuit },
  { id: "activity", label: "Atividades", icon: ShieldCheck },
  { id: "monitoring", label: "Monitoramento", icon: Activity },
  { id: "settings", label: "Configurações", icon: Settings },
];

const STORAGE_KEY = "grupo-jadson.workspace.v1";

const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;

function clampSidebarWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

/** Prévia de uma linha: o último texto da conversa, sem quebras de linha. */
function lastMessagePreview(conversation: Conversation): string {
  const last = [...conversation.messages].reverse().find((message) => message.content.trim().length > 0);
  return last ? last.content.replace(/\s+/g, " ").trim().slice(0, 80) : "Sem mensagens";
}

function readStoredValue(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

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

function Workspace() {
  const [page, setPage] = useState<PageId>("chat");
  const [health, setHealth] = useState<Health>("checking");
  const [postgresHealth, setPostgresHealth] = useState<Health>("checking");
  const [vectorHealth, setVectorHealth] = useState<Health>("checking");
  const [redisHealth, setRedisHealth] = useState<Health>("checking");
  const [configuredProviders, setConfiguredProviders] = useState<number | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() => readWorkspace().conversations);
  const [agents, setAgents] = useState<Agent[]>(() => readWorkspace().agents);
  const [groups, setGroups] = useState<Group[]>(() => readWorkspace().groups);
  const [remoteAgentIds, setRemoteAgentIds] = useState<string[]>([]);
  const [agentPersistence, setAgentPersistence] = useState<"checking" | "connected" | "local" | "error">("checking");
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [historyMenu, setHistoryMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!historyMenu) return;
    const close = () => setHistoryMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, [historyMenu]);

  function renameConversation(id: string, title: string) {
    const clean = title.trim();
    if (clean) setConversations((items) => items.map((item) => (item.id === id ? { ...item, title: clean.slice(0, 80) } : item)));
    setRenamingId(null);
  }

  function deleteConversation(id: string) {
    const item = conversations.find((c) => c.id === id);
    if (!window.confirm(`Excluir a conversa "${item?.title || "Nova conversa"}"? Isso não pode ser desfeito.`)) return;
    setConversations((items) => items.filter((c) => c.id !== id));
    if (activeConversation === id) { setActiveConversation(null); setPage("conversations"); }
  }
  const [historyQuery, setHistoryQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(Number(readStoredValue("grupo-jadson.sidebar-width")) || SIDEBAR_DEFAULT_WIDTH));

  useEffect(() => {
    try { localStorage.setItem("grupo-jadson.sidebar-width", String(sidebarWidth)); } catch { /* armazenamento indisponível: a largura vale só nesta sessão */ }
  }, [sidebarWidth]);

  /** Arrasta a borda do menu lateral; a largura acompanha o ponteiro dentro dos limites. */
  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const move = (moveEvent: PointerEvent) => setSidebarWidth(clampSidebarWidth(moveEvent.clientX));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [agentEditor, setAgentEditor] = useState<Agent | null>(null);
  const [viewedAgentId, setViewedAgentId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("grupo-jadson.sidebar-collapsed") === "true");
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem("grupo-jadson.focus-mode") === "true");
  const [agentSearch, setAgentSearch] = useState("");
  const [favoriteAgentIds, setFavoriteAgentIds] = useState<string[]>(readFavoriteAgents);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => conversations.find((c) => c.id === activeConversation) ?? null, [conversations, activeConversation]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { dependencies?: { postgres?: string; pgvector?: string; redis?: string } };
        setHealth("connected");
        setPostgresHealth(data.dependencies?.postgres === "connected" ? "connected" : "unavailable");
        setVectorHealth(data.dependencies?.pgvector === "connected" ? "connected" : "unavailable");
        setRedisHealth(data.dependencies?.redis === "connected" ? "connected" : "unavailable");
      })
      .then(() => apiFetch(`${API_URL}/providers`, { signal: controller.signal }))
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const status = await response.json() as ProviderStatus[];
        setProviders(status);
        setConfiguredProviders(status.filter((provider) => provider.configured).length);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth((value) => value === "checking" ? "unavailable" : value);
          setPostgresHealth((value) => value === "checking" ? "unavailable" : value);
          setVectorHealth((value) => value === "checking" ? "unavailable" : value);
          setRedisHealth((value) => value === "checking" ? "unavailable" : value);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (postgresHealth !== "connected") return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/conversations`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Histórico remoto indisponível");
        const remote = await response.json() as { id: string; title: string; agentId?: string | null; groupId?: string | null; messages: ChatMessage[]; updatedAt: string }[];
        setConversations((local) => {
          const localById = new Map(local.map((item) => [item.id, item]));
          const merged = remote.map((item) => {
            const saved = localById.get(item.id);
            const messages = item.messages.filter((message): message is ChatMessage => message.role === "user" || message.role === "assistant");
            return saved ? {
              ...saved,
              ...(typeof item.agentId === "string" ? { agentId: item.agentId } : {}),
              ...(typeof item.groupId === "string" ? { groupId: item.groupId, type: "group" as const } : {}),
              title: item.title || saved.title,
              messages: saved.messages.length >= messages.length ? saved.messages : messages,
              updatedAt: Math.max(saved.updatedAt, Date.parse(item.updatedAt) || 0)
            } : {
              id: item.id,
              title: item.title,
              messages,
              updatedAt: Date.parse(item.updatedAt) || Date.now(),
              ...(typeof item.agentId === "string" ? { agentId: item.agentId } : {}),
              ...(typeof item.groupId === "string" ? { groupId: item.groupId, type: "group" as const } : {})
            };
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
    apiFetch(`${API_URL}/agents`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("A API de agentes não respondeu.");
        let remote = await response.json() as Agent[];
        const knownIds = new Set(remote.map((agent) => agent.id));
        let migrationFailed = false;
        for (const localAgent of readWorkspace().agents) {
          if (knownIds.has(localAgent.id)) continue;
          try {
            const created = await apiFetch(`${API_URL}/agents`, {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(localAgent)
            });
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
          for (const agent of current) merged.set(agent.id, agent);
          return [...merged.values()];
        });
        setAgentPersistence(migrationFailed ? "error" : "connected");
      })
      .catch(() => { if (!controller.signal.aborted) setAgentPersistence("error"); });
    return () => controller.abort();
  }, [postgresHealth]);

  useEffect(() => {
    if (postgresHealth !== "connected") return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/groups`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const remote = await response.json() as (Omit<Group, "createdAt"> & { createdAt: string })[];
      setGroups(remote.map((item) => ({ ...item, createdAt: Date.parse(item.createdAt) || Date.now() })));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [postgresHealth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, serializeWorkspace({ conversations, agents, groups }));
  }, [conversations, agents, groups]);
  useEffect(() => { localStorage.setItem("grupo-jadson.sidebar-collapsed", String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem("grupo-jadson.focus-mode", String(focusMode)); }, [focusMode]);
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);
  useEffect(() => { localStorage.setItem("grupo-jadson.favorite-agents", JSON.stringify(favoriteAgentIds)); }, [favoriteAgentIds]);

  function newConversation(agentId?: string, groupId?: string) {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: "Nova conversa",
      messages: [],
      updatedAt: Date.now(),
      ...(agentId ? { agentId } : {}),
      ...(groupId ? { groupId, type: "group" as const } : {})
    };
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

  async function sendMessage(contentInput: string, model: string, agent: Agent | undefined, selectedFiles: File[] = [], titleHint?: string) {
    const content = contentInput.trim();
    const title = (titleHint ?? content).trim();
    if ((!content && !selectedFiles.length) || busy) return;
    let conversationId = activeConversation;
    if (!conversationId) {
      const conversation: Conversation = { id: crypto.randomUUID(), title: title.slice(0, 48), messages: [], updatedAt: Date.now() };
      conversationId = conversation.id;
      setActiveConversation(conversationId);
      setConversations((items) => [conversation, ...items]);
    }
    const id = conversationId;
    const userMessage: ChatMessage = { role: "user", content: content || "Analise a imagem anexada." };
    const current = conversations.find((item) => item.id === id);
    const prior = current?.messages ?? [];
    setConversations((items) => items.map((item) => item.id === id ? {
      ...item,
      ...(agent ? { agentId: agent.id } : {}),
      title: item.messages.length ? item.title : (title || "Imagem enviada").slice(0, 48),
      messages: [...item.messages, userMessage],
      updatedAt: Date.now()
    } : item));
    setDraft(""); setFiles([]); setError(null); setBusy(true); setActiveAgentId(agent?.id ?? null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const attachments = await Promise.all(selectedFiles.map(async (file) => ({
        id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size,
        dataUrl: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler o anexo."));
          reader.onerror = () => reject(new Error("Não foi possível ler o anexo.")); reader.readAsDataURL(file);
        })
      })));
      if (attachments.some((attachment) => !["image/png", "image/jpeg", "image/webp"].includes(attachment.type) || attachment.size > 5 * 1024 * 1024) || attachments.reduce((sum, item) => sum + item.size, 0) > 5 * 1024 * 1024) {
        throw new Error("Anexe até 5 MB de imagens PNG, JPEG ou WebP por mensagem.");
      }
      setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: item.messages.map((message, index) => index === item.messages.length - 1 && message.role === "user" ? { ...message, attachments } : message) } : item));
      const response = await apiFetch(`${API_URL}/chat/completions`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          ...(agent ? { agentId: agent.id } : {}),
          ...(current?.groupId ? { groupId: current.groupId } : {}),
          attachments,
          messages: [...prior, userMessage],
          ...(model.trim() ? { model: model.trim() } : {})
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `A API respondeu com HTTP ${response.status}.`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("A API não retornou um fluxo de resposta legível.");
      const decoder = new TextDecoder(); let answer = ""; let pending = "";
      setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: [...item.messages, { role: "assistant", content: "", ...(agent ? { agentId: agent.id } : {}) }] } : item));
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
            setConversations((items) => items.map((item) => item.id === id ? {
              ...item,
              messages: item.messages.map((message, index) => index === item.messages.length - 1 && message.role === "assistant" ? { ...message, content: answer } : message),
              updatedAt: Date.now()
            } : item));
          } catch { /* ignore incomplete frames */ }
        }
      }
      if (!answer) throw new Error("O provedor encerrou a resposta sem conteúdo.");
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: item.messages.filter((message) => message.role !== "assistant" || message.content.length > 0) } : item));
      if (!aborted) setError(cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem.");
    } finally { setBusy(false); setActiveAgentId(null); abortRef.current = null; }
  }

  async function persistAgent(agent: Agent) {
    if (postgresHealth !== "connected" || agentPersistence === "checking") return;
    const exists = remoteAgentIds.includes(agent.id);
    try {
      const response = await apiFetch(exists ? `${API_URL}/agents/${agent.id}` : `${API_URL}/agents`, {
        method: exists ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      });
      if (!response.ok) throw new Error("Não foi possível salvar o agente no banco.");
      const saved = await response.json() as Agent;
      setRemoteAgentIds((ids) => ids.includes(saved.id) ? ids : [...ids, saved.id]);
      setAgents((items) => items.map((item) => item.id === agent.id ? saved : item));
      setAgentPersistence("connected");
    } catch { setAgentPersistence("error"); }
  }

  async function persistGroup(group: Group) {
    if (postgresHealth === "connected") {
      try {
        const response = await apiFetch(`${API_URL}/groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(group) });
        if (!response.ok) throw new Error("Não foi possível salvar o grupo no PostgreSQL.");
        const saved = await response.json() as Omit<Group, "createdAt"> & { createdAt: string };
        setGroups((items) => [{ ...saved, createdAt: Date.parse(saved.createdAt) || Date.now() }, ...items.filter((item) => item.id !== saved.id)]);
        return;
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar grupo."); }
    }
    setGroups((items) => [group, ...items.filter((item) => item.id !== group.id)]);
  }

  async function archiveGroup(id: string) {
    if (postgresHealth === "connected") {
      try { const response = await apiFetch(`${API_URL}/groups/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Não foi possível arquivar o grupo."); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao arquivar grupo."); return; }
    }
    setGroups((items) => items.filter((item) => item.id !== id));
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
  const title = page === "agent-detail" ? viewedAgent?.name ?? "Perfil do agente" : [...NAV, ...SECONDARY_NAV, { id: "chat" as PageId, label: "Conversa", icon: MessageSquare }].find((item) => item.id === page)?.label ?? "Início";
  const serviceLabel = health === "connected" ? "Controlador Conectado" : health === "checking" ? "Verificando API" : "Modo Local";

  const visibleSidebarAgents = agents.filter((agent) => agent.name.toLocaleLowerCase().includes(agentSearch.trim().toLocaleLowerCase())).sort((a, b) => Number(favoriteAgentIds.includes(b.id)) - Number(favoriteAgentIds.includes(a.id))).slice(0, 6);
  function toggleFavoriteAgent(id: string) { setFavoriteAgentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  return (
    <div className={`app-shell flex min-h-dvh ${sidebarCollapsed ? "app-shell-collapsed" : ""} ${focusMode ? "app-shell-focus" : ""}`} style={{ "--sidebar-width": `${sidebarCollapsed ? 72 : sidebarWidth}px` } as CSSProperties}>
      <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Abrir menu"><Boxes size={19} /></button>
      {mobileOpen && <button className="scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}

      {/* SIDEBAR PREMIUM */}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {!sidebarCollapsed && (
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar menu lateral"
            onPointerDown={startSidebarResize}
          />
        )}
        <div className="brand">
          <div className="brand-logo-wrap">
            <img src={logo} alt="Logo Grupo Jadson" />
          </div>
          <div className="brand-copy">
            <strong>GRUPO JADSON</strong>
            <span>CONTROLADOR DE IA</span>
          </div>
          <button className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* NOVA CONVERSA - DESTAQUE */}
        <button className="new-chat" onClick={() => newConversation()} aria-label="Nova conversa">
          <Plus size={16} />
          <span>Nova conversa</span>
        </button>

        {/* NAVEGAÇÃO PRINCIPAL */}
        <nav className="nav-primary" aria-label="Navegação principal">
          {NAV.slice(0, 3).map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === id || (id === "conversations" && page === "chat") ? "active" : ""}`}
              key={id}
              onClick={() => changePage(id)}
              title={sidebarCollapsed ? label : undefined}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* HISTÓRICO DE CONVERSAS: busca e lista recente, logo abaixo da navegação */}
        {conversations.length > 0 && !sidebarCollapsed && (
          <div className="history">
            <div className="sidebar-section-header">
              <span className="section-label">CONVERSAS</span>
            </div>
            <label className="history-search">
              <Search size={13} />
              <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Buscar conversas" aria-label="Buscar conversas" />
            </label>
            <div className="history-list">
              {conversations
                .filter((item) => (item.title || "Nova conversa").toLowerCase().includes(historyQuery.trim().toLowerCase()))
                .slice(0, 30)
                .map((item) => renamingId === item.id ? (
                  <div key={item.id} className="history-item">
                    <MessageSquare size={14} />
                    <input
                      autoFocus
                      aria-label="Novo nome da conversa"
                      value={renameDraft}
                      maxLength={80}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") renameConversation(item.id, renameDraft);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => renameConversation(item.id, renameDraft)}
                      style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
                    />
                  </div>
                ) : (
                  <button
                    key={item.id}
                    className={`history-item ${activeConversation === item.id && page === "chat" ? "history-active" : ""}`}
                    onClick={() => { setActiveConversation(item.id); setPage("chat"); setMobileOpen(false); }}
                    onContextMenu={(event) => { event.preventDefault(); setHistoryMenu({ id: item.id, x: event.clientX, y: event.clientY }); }}
                    title={item.title}
                  >
                    <MessageSquare size={14} />
                    <span className="history-copy">
                      <strong>{item.title || "Nova conversa"}</strong>
                      <small>{lastMessagePreview(item)}</small>
                    </span>
                  </button>
                ))}
              {historyMenu && (
                <div
                  role="menu"
                  onClick={(event) => event.stopPropagation()}
                  style={{ position: "fixed", left: historyMenu.x, top: historyMenu.y, zIndex: 1000, background: "#161616", border: "1px solid #3a3a3a", borderRadius: 8, padding: 4, display: "grid", minWidth: 150 }}
                >
                  <button role="menuitem" className="history-item" onClick={() => {
                    const target = conversations.find((c) => c.id === historyMenu.id);
                    setRenameDraft(target?.title || "");
                    setRenamingId(historyMenu.id);
                    setHistoryMenu(null);
                  }}>Renomear</button>
                  <button role="menuitem" className="history-item" onClick={() => { const id = historyMenu.id; setHistoryMenu(null); deleteConversation(id); }}>Excluir</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SEUS AGENTES (ACESSO RÁPIDO) */}
        <div className="sidebar-agents">
          <div className="sidebar-section-header">
            <span className="section-label">AGENTES</span>
            {!sidebarCollapsed && <span className="agent-count-pill">{agents.length}</span>}
          </div>
          {!sidebarCollapsed && agents.length > 3 && (
            <label className="sidebar-agent-search">
              <Search size={13} />
              <input value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder="Filtrar agentes…" aria-label="Buscar agentes" />
            </label>
          )}
          <div className="sidebar-agent-list">
            {visibleSidebarAgents.map((agent) => (
              <div key={agent.id} className="sidebar-agent-row">
                <button
                  className="sidebar-agent"
                  title={sidebarCollapsed ? agent.name + " · " + (activeAgentId === agent.id ? "Pensando" : agent.enabled ? "Ativado" : "Desativado") : undefined}
                  onClick={() => agent.enabled && newConversation(agent.id)}
                  disabled={!agent.enabled}
                  aria-label={"Conversar com " + agent.name}
                >
                  <span className="agent-avatar">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span>
                  <span className="sidebar-agent-copy">
                    <b>{agent.name}</b>
                    <small>{activeAgentId === agent.id ? "Em execução…" : agent.enabled ? "Pronto" : "Desativado"}</small>
                  </span>
                  <i className={"agent-presence " + (activeAgentId === agent.id ? "thinking" : agent.enabled ? "enabled" : "")} />
                </button>
                {!sidebarCollapsed && (
                  <button
                    className={"favorite-agent " + (favoriteAgentIds.includes(agent.id) ? "is-favorite" : "")}
                    onClick={() => toggleFavoriteAgent(agent.id)}
                    aria-label={favoriteAgentIds.includes(agent.id) ? "Remover dos favoritos" : "Favoritar"}
                    title={favoriteAgentIds.includes(agent.id) ? "Remover dos favoritos" : "Favoritar"}
                  >
                    <Star size={13} fill={favoriteAgentIds.includes(agent.id) ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            ))}
            {agents.length === 0 && !sidebarCollapsed && <small className="sidebar-empty">Nenhum agente configurado.</small>}
          </div>
        </div>

        {/* NAVEGAÇÃO SECUNDÁRIA INFERIOR */}
        <div className="sidebar-secondary">
          {SECONDARY_NAV.map(({ id, label, icon: Icon }) => (
            <button className={`nav-item ${page === id ? "active" : ""}`} key={id} onClick={() => changePage(id)} title={sidebarCollapsed ? label : undefined}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* RODAPÉ E STATUS */}
        <div className="sidebar-bottom">
          <span className={`connection-dot ${health}`} />
          <span className="status-text">{health === "connected" ? "Controlador Online" : health === "checking" ? "Verificando…" : "Modo Local Seguro"}</span>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-root">Controlador</span>
            <span className="breadcrumb-separator">/</span>
            <b>{title}</b>
          </div>
          <div className={`status status-${health}`}>
            <i />
            {serviceLabel}
          </div>
        </header>

        {page === "dashboard" && (
          <Dashboard
            health={health}
            postgresHealth={postgresHealth}
            vectorHealth={vectorHealth}
            redisHealth={redisHealth}
            configuredProviders={configuredProviders}
            agents={agents}
            conversations={conversations}
            busy={busy}
            activeAgentName={agents.find((agent) => agent.id === activeAgentId)?.name}
            onNavigate={changePage}
            onStartTask={(task, agentId) => { setDraft(task); newConversation(agentId); }}
            onOpenConversation={(id) => { setActiveConversation(id); setPage("chat"); }}
          />
        )}
        {page === "chat" && (
          <ChatPage
            conversation={active}
            agents={agents}
            groups={groups}
            draft={draft}
            busy={busy}
            activeAgentId={activeAgentId}
            error={error}
            files={files}
            setDraft={setDraft}
            setFiles={setFiles}
            onSend={sendMessage}
            onCancel={() => abortRef.current?.abort()}
            onDismissError={() => setError(null)}
            onChooseFiles={() => inputRef.current?.click()}
            inputRef={inputRef}
            focusMode={focusMode}
            setFocusMode={setFocusMode}
          />
        )}
        {page === "agents" && (
          <AgentsPage
            agents={agents}
            remoteAgentIds={remoteAgentIds}
            persistence={agentPersistence}
            onCreate={() => setAgentEditor({ id: crypto.randomUUID(), name: "", description: "", instructions: "", model: "", enabled: true })}
            onEdit={setAgentEditor}
            onToggle={toggleAgent}
            onChat={(id) => newConversation(id)}
            onOpen={openAgentProfile}
          />
        )}
        {page === "agent-detail" && viewedAgent && (
          <AgentDetailPage
            agent={viewedAgent}
            conversations={conversations}
            persistence={agentPersistence}
            onBack={() => setPage("agents")}
            onEdit={() => setAgentEditor(viewedAgent)}
            onChat={() => newConversation(viewedAgent.id)}
            onOpenConversation={(id) => { setActiveConversation(id); setPage("chat"); }}
          />
        )}
        {page === "conversations" && (
          <ConversationsPage
            conversations={conversations}
            agents={agents}
            onNew={newConversation}
            onOpen={(id) => { setActiveConversation(id); setPage("chat"); }}
          />
        )}
        {page === "groups" && <GroupsPage groups={groups} agents={agents} persistence={postgresHealth} onSave={persistGroup} onArchive={archiveGroup} onChat={(group) => newConversation(undefined, group.id)} />}
        {page === "models" && <ModelsPage providers={providers} onOpenChat={() => changePage("chat")} />}
        {page === "settings" && <SettingsPage providers={providers} />}
        {page === "monitoring" && (
          <MonitoringPage
            health={health}
            postgres={postgresHealth}
            vector={vectorHealth}
            redis={redisHealth}
            providerCount={configuredProviders}
          />
        )}
        {page === "activity" && <ActivityPage />}
        {!(["dashboard", "chat", "agents", "agent-detail", "conversations", "groups", "models", "settings", "monitoring", "activity"] as PageId[]).includes(page) && (
          <ComingSoonPage page={page} onNavigate={changePage} />
        )}
      </main>

      {agentEditor && (
        <AgentModal agent={agentEditor} onChange={setAgentEditor} onClose={() => setAgentEditor(null)} onSubmit={saveAgent} />
      )}
    </div>
  );
}

/* =========================================================================
   DASHBOARD / LAUNCHER DE IA (COMMAND CENTER)
   ========================================================================= */
function Dashboard({
  health, postgresHealth, vectorHealth, redisHealth, configuredProviders, agents, conversations,
  busy, activeAgentName, onNavigate, onStartTask, onOpenConversation
}: {
  health: Health; postgresHealth: Health; vectorHealth: Health; redisHealth: Health;
  configuredProviders: number | null; agents: Agent[]; conversations: Conversation[];
  busy: boolean; activeAgentName?: string | undefined;
  onNavigate: (page: PageId) => void;
  onStartTask: (task: string, agentId?: string) => void;
  onOpenConversation: (id: string) => void;
}) {
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("");
  const recent = conversations.slice(0, 4);
  const selectedAgent = agents.find((agent) => agent.id === agentId && agent.enabled);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia, Jadson." : hour < 18 ? "Boa tarde, Jadson." : "Boa noite, Jadson.";

  function startTask(value = task) {
    const next = value.trim();
    if (!next) return;
    setTask("");
    onStartTask(next, selectedAgent?.id);
  }

  return (
    <div className="page-content dashboard-page workspace-home">
      {/* HERO SECTION */}
      <section className="home-hero">
        <div className="home-hero-text">
          <div className="home-badge">
            <Sparkles size={13} className="text-gold" />
            <span>CONTROLADOR DE IA • GRUPO JADSON</span>
          </div>
          <h1>{greeting}</h1>
          <p className="home-subtitle">O que você gostaria de explorar, orquestrar ou construir agora?</p>
        </div>
        <div className={"home-presence-badge " + (busy ? "is-working" : "")}>
          <i />
          <span>{busy ? "Em execução" + (activeAgentName ? " · " + activeAgentName : "") : health === "connected" ? "Controlador Pronto" : "Modo Local"}</span>
        </div>
      </section>

      {/* ACTION LAUNCHER (O CAMPO PRINCIPAL DE INÍCIO) */}
      <section className="task-launcher" aria-label="Iniciar tarefa">
        <form
          className="task-launcher-form"
          onSubmit={(event) => { event.preventDefault(); startTask(); }}
        >
          <textarea
            value={task}
            onChange={(event) => setTask(event.target.value)}
            rows={2}
            placeholder="Como o Grupo Jadson pode ajudar você agora? Digite sua ideia ou comando…"
            aria-label="Descreva sua tarefa"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                startTask();
              }
            }}
          />
          <div className="task-launcher-bottom">
            <div className="task-launcher-options">
              <label className="agent-picker-pill">
                <Bot size={15} />
                <select
                  aria-label="Agente para a tarefa"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  <option value="">Assistente Geral (Padrão)</option>
                  {agents.filter((agent) => agent.enabled).map((agent) => (
                    <option value={agent.id} key={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <button className="task-submit-btn" type="submit" disabled={!task.trim()} title="Enviar tarefa">
              <span>Iniciar</span>
              <ArrowUp size={16} />
            </button>
          </div>
        </form>

        {/* SUGESTÕES DE PROMPTS */}
        <div className="task-chips">
          <span className="chips-label">Sugestões rápidas:</span>
          {[
            "Resumir documentos e extrair insights",
            "Criar plano estratégico para novo projeto",
            "Analisar código e sugerir melhorias",
            "Rascunhar comunicado executivo"
          ].map((suggestion) => (
            <button key={suggestion} className="chip-btn" onClick={() => startTask(suggestion)}>
              <span>{suggestion}</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
      </section>

      {/* SEÇÃO PRINCIPAL DE AÇÃO: AGENTES E CONVERSAS RECENTES */}
      <div className="home-dashboard-grid">
        {/* AGENTES ESPECIALISTAS */}
        <section className="home-card team-card">
          <div className="home-card-header">
            <div>
              <span className="section-label">EQUIPE DE IA</span>
              <h2>Agentes Especialistas</h2>
            </div>
            <button className="view-all-link" onClick={() => onNavigate("agents")}>
              Ver galeria <ArrowUpRight size={14} />
            </button>
          </div>

          {agents.length === 0 ? (
            <div className="home-card-empty">
              <Bot size={22} />
              <span>Nenhum perfil de agente criado ainda.</span>
              <button className="btn-secondary-sm" onClick={() => onNavigate("agents")}>
                Criar primeiro agente <Plus size={13} />
              </button>
            </div>
          ) : (
            <div className="home-agents-grid">
              {agents.slice(0, 4).map((agent) => (
                <button
                  className="agent-quick-card"
                  key={agent.id}
                  onClick={() => {
                    if (!agent.enabled) return;
                    setAgentId(agent.id);
                    document.querySelector<HTMLTextAreaElement>(".task-launcher-form textarea")?.focus();
                  }}
                  disabled={!agent.enabled}
                  title={agent.enabled ? "Selecionar no lançador de tarefas" : "Agente desativado"}
                >
                  <div className="agent-avatar-ring">
                    <span className="agent-avatar-text">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span>
                  </div>
                  <div className="agent-quick-info">
                    <b>{agent.name}</b>
                    <small>{agent.description || "Especialista Grupo Jadson"}</small>
                  </div>
                  <span className={"agent-status-dot " + (agent.enabled ? "is-active" : "is-inactive")} />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* CONTINUAR CONVERSAS */}
        <section className="home-card recent-card">
          <div className="home-card-header">
            <div>
              <span className="section-label">HISTÓRICO</span>
              <h2>Continuar Conversas</h2>
            </div>
            <button className="view-all-link" onClick={() => onNavigate("conversations")}>
              Ver todas <ArrowUpRight size={14} />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="home-card-empty">
              <MessageSquare size={22} />
              <span>Nenhuma conversa ativa no momento.</span>
              <button className="btn-secondary-sm" onClick={() => onNavigate("chat")}>
                Abrir chat <ArrowUpRight size={13} />
              </button>
            </div>
          ) : (
            <div className="home-recent-list">
              {recent.map((conv) => (
                <button
                  className="recent-conv-item"
                  key={conv.id}
                  onClick={() => onOpenConversation(conv.id)}
                >
                  <div className="conv-icon-wrap">
                    <MessageSquare size={15} />
                  </div>
                  <div className="conv-copy">
                    <b>{conv.title || "Nova conversa"}</b>
                    <small>{conv.messages.length} mensagens • {new Date(conv.updatedAt).toLocaleDateString()}</small>
                  </div>
                  <ArrowUpRight size={15} className="conv-arrow" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* DISCRETA BARRA DE STATUS DOS SERVIÇOS (SEM POLUIÇÃO CORPORATIVA) */}
      <footer className="home-system-bar">
        <div className="system-status-pills">
          <span className="system-pill">
            <span className={`status-dot ${health}`} />
            API: {health === "connected" ? "Online" : "Local"}
          </span>
          <span className="system-pill">
            <span className={`status-dot ${postgresHealth}`} />
            PostgreSQL: {postgresHealth === "connected" ? "Sincronizado" : "Local"}
          </span>
          <span className="system-pill">
            <span className={`status-dot ${configuredProviders && configuredProviders > 0 ? "connected" : "unavailable"}`} />
            Provedor IA: {configuredProviders && configuredProviders > 0 ? `${configuredProviders} Ativo(s)` : "Padrão"}
          </span>
        </div>
        <button className="system-detail-btn" onClick={() => onNavigate("monitoring")}>
          Observabilidade <ArrowUpRight size={12} />
        </button>
      </footer>
    </div>
  );
}

/* =========================================================================
   CHAT PAGE (EXPERIÊNCIA CONVERSACIONAL MODERNA)
   ========================================================================= */
function ChatPage({
  conversation, agents, groups, draft, busy, activeAgentId, error, files,
  setDraft, setFiles, onSend, onCancel, onDismissError, onChooseFiles, inputRef, focusMode, setFocusMode
}: {
  conversation: Conversation | null; agents: Agent[]; groups: Group[]; draft: string; busy: boolean;
  activeAgentId: string | null; error: string | null; files: File[];
  setDraft: (value: string) => void; setFiles: (value: File[]) => void;
  onSend: (content: string, model: string, agent: Agent | undefined, files?: File[], titleHint?: string) => void;
  onCancel: () => void; onDismissError: () => void; onChooseFiles: () => void;
  inputRef: RefObject<HTMLInputElement>;
  focusMode: boolean; setFocusMode: (updater: (value: boolean) => boolean) => void;
}) {
  const [model, setModel] = useState("");
  const [agentId, setAgentId] = useState(conversation?.agentId ?? "");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDocs, setPdfDocs] = useState<{ id: string; name: string; pages: number; text: string; truncated: boolean }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /** Lê o texto de cada PDF pelo backend e coloca no rascunho, com nome e páginas. */
  async function attachPdfs(pdfs: File[]) {
    for (const pdf of pdfs) {
      try {
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const response = await apiFetch(`${API_URL}/documents/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: pdf.name, contentBase64: btoa(binary) }),
        });
        const body = (await response.json().catch(() => ({}))) as { message?: string; text?: string; pages?: number; truncated?: boolean; filename?: string };
        if (!response.ok) throw new Error(body.message ?? "Não foi possível ler o PDF.");
        // O PDF fica como anexo (chip) e o texto só vai junto na mensagem enviada.
        setPdfDocs((items) => [...items, {
          id: crypto.randomUUID(),
          name: body.filename ?? pdf.name,
          pages: body.pages ?? 0,
          text: body.text ?? "",
          truncated: Boolean(body.truncated),
        }]);
        setPdfError(null);
      } catch (error) {
        setPdfError(error instanceof Error ? error.message : "Não foi possível ler o PDF.");
      }
    }
  }

  /** Registra a delegação e passa a conversa para o agente escolhido nas próximas mensagens. */
  async function delegate() {
    if (!conversation || !delegateTo) return;
    setDelegating(true);
    setDelegateError(null);
    try {
      const response = await apiFetch(`${API_URL}/handoffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, fromAgentId: agentId || null, toAgentId: delegateTo }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Não foi possível delegar.");
      setAgentId(delegateTo);
      setDelegateOpen(false);
      setDelegateTo("");
    } catch (error) {
      setDelegateError(error instanceof Error ? error.message : "Não foi possível delegar.");
    } finally {
      setDelegating(false);
    }
  }

  useEffect(() => { setAgentId(conversation?.agentId ?? ""); }, [conversation?.id, conversation?.agentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, busy]);

  const currentGroup = groups.find((group) => group.id === conversation?.groupId);
  const availableAgents = agents.filter((agent) => agent.enabled && (!currentGroup || currentGroup.agentIds.includes(agent.id)));
  const selectedAgent = availableAgents.find((agent) => agent.id === agentId);
  const runningAgent = agents.find((agent) => agent.id === activeAgentId);
  const mentionQuery = currentGroup?.mode === "mention" ? /(?:^|\s)@([^\s@]*)$/.exec(draft)?.[1] : undefined;

  return (
    <div className={"chat-page " + (workspaceOpen ? "chat-workspace-open" : "")}>
      {/* HEADER SUPERIOR DO CHAT */}
      <div className="chat-heading">
        <div className="chat-title-group">
          <h1>{currentGroup ? `${currentGroup.name} · ${conversation?.title ?? "Nova conversa"}` : conversation?.title ?? "Nova conversa"}</h1>
          {selectedAgent && (
            <span className="chat-agent-badge">
              <Bot size={13} />
              {selectedAgent.name}
            </span>
          )}
        </div>
        <div className="chat-heading-actions">
          <button
            className="focus-mode-btn"
            onClick={() => setFocusMode((value) => !value)}
            aria-pressed={focusMode}
            aria-label={focusMode ? "Sair do modo foco" : "Ativar modo foco"}
            title={focusMode ? "Sair do modo foco (Esc)" : "Modo foco: oculta menus laterais"}
          >
            {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {conversation && conversation.messages.length > 0 && (
            <div className="chat-delegate">
              {!delegateOpen ? (
                <button className="workspace-toggle-btn" onClick={() => setDelegateOpen(true)} title="Passar a conversa para outro agente">
                  <Bot size={14} />
                  <span>Delegar</span>
                </button>
              ) : (
                <>
                  <select
                    className="chat-delegate-select"
                    value={delegateTo}
                    onChange={(event) => setDelegateTo(event.target.value)}
                    aria-label="Agente de destino"
                  >
                    <option value="">Escolha um agente</option>
                    {agents.filter((agent) => agent.enabled && agent.id !== agentId).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                  <button className="workspace-toggle-btn" disabled={!delegateTo || delegating} onClick={delegate}>
                    <span>{delegating ? "Delegando..." : "Confirmar"}</span>
                  </button>
                  <button className="workspace-toggle-btn" onClick={() => { setDelegateOpen(false); setDelegateError(null); }}>
                    <span>Cancelar</span>
                  </button>
                </>
              )}
              {delegateError && <small className="chat-delegate-error" role="alert">{delegateError}</small>}
            </div>
          )}
          <div className="chat-model-indicator">
            <Sparkles size={13} />
            <span>{model.trim() || "Modelo Padrão"}</span>
          </div>
          <button
            className={"workspace-toggle-btn " + (workspaceOpen ? "is-open" : "")}
            onClick={() => setWorkspaceOpen((open) => !open)}
            aria-expanded={workspaceOpen}
            title="Painel de contexto"
          >
            <PanelRight size={16} />
            <span>Contexto</span>
          </button>
        </div>
      </div>

      {/* ÁREA DE MENSAGENS */}
      <div className="messages-area" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const images = Array.from(event.dataTransfer.files).filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type)); setFiles([...files, ...images]); }}>
        {!conversation?.messages.length ? (
          /* ESTADO INICIAL VAZIO */
          <div className="chat-empty-hero">
            <div className="chat-hero-glow">
              <img src={logo} alt="Grupo Jadson" className="chat-hero-logo" />
            </div>
            <h2>O que vamos construir hoje?</h2>
            <p className="chat-hero-desc">
              Envie instruções, analise dados ou orquestre agentes de IA para acelerar seus projetos.
            </p>

            <div className="chat-prompt-suggestions">
              {[
                { title: "Verificar serviços", desc: "Consultar conexões e APIs disponíveis", prompt: "Quais serviços e bancos de dados estão conectados no momento?" },
                { title: "Consultar agentes", desc: "Listar perfis e especialidades ativas", prompt: "Quais agentes de IA estão configurados para operar comigo?" },
                { title: "Elaborar plano de ação", desc: "Estruturar etapas para nova meta", prompt: "Ajude-me a estruturar um plano de ação completo para uma nova iniciativa." },
                { title: "Analisar código e arquitetura", desc: "Revisar estrutura e boas práticas", prompt: "Quais são as melhores práticas para orquestração de IA moderna?" }
              ].map((item) => (
                <button
                  key={item.title}
                  className="prompt-card"
                  onClick={() => setDraft(item.prompt)}
                >
                  <div className="prompt-card-top">
                    <b>{item.title}</b>
                    <ArrowUpRight size={14} className="prompt-card-arrow" />
                  </div>
                  <small>{item.desc}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* FLUXO DE MENSAGENS CONVERSACIONAIS */
          <div className="message-list-stream">
            {conversation.messages.map((message, index) => (
              <div
                className={"message-row message-row-" + message.role}
                key={index + "-" + message.role}
              >
                {message.role === "assistant" && (
                  <div className="assistant-avatar-badge">
                    <img src={logo} alt="GJ" />
                  </div>
                )}
                <div className="message-bubble">
                  <div className="message-header-author">
                    <b>{message.role === "user" ? "Você" : agents.find((item) => item.id === message.agentId)?.name ?? "Grupo Jadson"}</b>
                  </div>
                  <div className="message-content">
                    {message.attachments?.map((attachment) => attachment.dataUrl && <img key={attachment.id} className="message-image-attachment" src={attachment.dataUrl} alt={attachment.name} onClick={() => window.open(attachment.dataUrl, "_blank", "noopener,noreferrer")} />)}
                    {message.content ? (
                      <MarkdownContent content={message.content} />
                    ) : busy ? (
                      <div className="streaming-indicator">
                        <span className="streaming-dot" />
                        <span className="streaming-dot" />
                        <span className="streaming-dot" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* COMPOSER FLUTUANTE MODERNO */}
      <div className="composer-wrapper">
        {error && (
          <div className="composer-error" role="alert">
            <CircleHelp size={15} />
            <span>{error}</span>
            <button onClick={onDismissError} aria-label="Fechar erro"><X size={14} /></button>
          </div>
        )}

        {files.length > 0 && (
          <div className="composer-attachments">
            {files.map((file) => (
              <span key={file.name + "-" + file.size} className="attachment-pill">
                <FilePreview file={file} />
                {file.name}
                <button onClick={() => setFiles(files.filter((item) => item !== file))} aria-label="Remover">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {pdfDocs.length > 0 && (
          <div className="composer-attachments">
            {pdfDocs.map((doc) => (
              <span key={doc.id} className="attachment-pill">
                {doc.name} · {doc.pages} página{doc.pages === 1 ? "" : "s"}
                <button type="button" onClick={() => setPdfDocs((items) => items.filter((item) => item.id !== doc.id))} aria-label="Remover PDF">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {pdfError && <div className="composer-error" role="alert" onClick={() => setPdfError(null)}>{pdfError}</div>}
        <form
          className="composer-capsule"
            onSubmit={(event) => {
              event.preventDefault();
              // Cada PDF vai como bloco de documento antes do texto digitado.
              const blocks = pdfDocs.map((doc) => `[Documento: ${doc.name} (${doc.pages} página${doc.pages === 1 ? "" : "s"})]\n${doc.text}${doc.truncated ? "\n[texto cortado]" : ""}`);
              const message = [...blocks, draft].filter((part) => part.trim()).join("\n\n");
              if (!message && files.length === 0) return;
              // O título da conversa usa o que você digitou (ou o nome do PDF), não o texto do documento.
              const typed = draft.trim();
              const docNames = pdfDocs.map((doc) => doc.name).join(", ");
              onSend(message, model, selectedAgent, files, typed || (docNames ? `PDF: ${docNames}` : undefined));
              setPdfDocs([]);
            }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Como o Grupo Jadson pode ajudar você hoje? (Shift+Enter para quebra de linha)"
            rows={1}
            aria-label="Mensagem"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            onPaste={(event) => { const images = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file)).filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type)); if (images.length) setFiles([...files, ...images]); }}
          />
          {mentionQuery !== undefined && <div className="mention-suggestions" role="listbox">{availableAgents.filter((agent) => agent.name.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase())).map((agent) => <button type="button" key={agent.id} role="option" onClick={() => setDraft(draft.replace(/@[^\s@]*$/, `@${agent.name} `))}><span className="mention-avatar">{agent.name.slice(0, 1)}</span><span><b>{agent.name}</b><small>{agent.role || agent.description || "Agente"}</small></span></button>)}</div>}

          <div className="composer-toolbar">
            <div className="composer-left-actions">
              <input
                ref={inputRef}
                hidden
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => {
                  const chosen = Array.from(event.target.files ?? []);
                  setFiles([...files, ...chosen.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type))]);
                  void attachPdfs(chosen.filter((file) => file.type === "application/pdf"));
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={onChooseFiles}
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
              >
                <Paperclip size={16} />
              </button>

              {/* SELETOR DE MODELO */}
              <label className="toolbar-pill-label">
                <Sparkles size={13} className="text-gold" />
                <input
                  className="model-inline-input"
                  aria-label="ID do modelo"
                  placeholder="Modelo padrão"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>

              {/* SELETOR DE PERFIL / AGENTE */}
              <label className="toolbar-pill-label">
                <Bot size={14} />
                <select
                  className="agent-inline-select"
                  aria-label="Perfil associado"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  <option value="">Sem perfil</option>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
            </div>

            <div className="composer-right-actions">
              {busy ? (
                <button
                  type="button"
                  className="send-round-btn stop-action"
                  onClick={onCancel}
                  title="Parar geração"
                  aria-label="Parar geração"
                >
                  <Square size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-round-btn send-action"
                  disabled={!draft.trim() && files.length === 0}
                  title="Enviar mensagem"
                  aria-label="Enviar mensagem"
                >
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </div>
        </form>

        <p className="composer-disclaimer">
          Grupo Jadson AI Controller · O histórico local é mantido neste dispositivo; sincronização PostgreSQL e geração dependem do backend configurado.
        </p>
      </div>

      {/* WORKSPACE PANEL FLUTUANTE */}
      {workspaceOpen && (
        <aside className="chat-workspace-panel" id="chat-workspace" aria-label="Contexto da conversa">
          <div className="workspace-panel-heading">
            <div>
              <span className="section-label">PAINEL DE EXECUÇÃO</span>
              <h2>Contexto</h2>
            </div>
            <button className="icon-btn-close" onClick={() => setWorkspaceOpen(false)} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>

          <div className="workspace-run-state">
            <span className={"run-state-dot " + (busy ? "working" : "idle")} />
            <div>
              <b>{busy ? "Resposta em transmissão" : "Execução em repouso"}</b>
              <small>{busy ? "O backend está gerando e transmitindo tokens SSE." : "Pronto para receber novos comandos."}</small>
            </div>
          </div>

          <div className="workspace-fact">
            <span>Conversa ativa</span>
            <b>{conversation?.title || "Nova conversa"}</b>
          </div>
          <div className="workspace-fact">
            <span>Agente vinculado</span>
            <b>{busy && runningAgent ? runningAgent.name : selectedAgent?.name ?? "Assistente Geral"}</b>
          </div>
          <div className="workspace-fact">
            <span>Total de mensagens</span>
            <b>{conversation?.messages.length ?? 0}</b>
          </div>

          <div className="workspace-info-card">
            <ShieldCheck size={16} />
            <p>O backend aplica as instruções persistidas do agente. A disponibilidade do histórico e do provider depende das conexões configuradas.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

function GroupsPage({ groups, agents, persistence, onSave, onArchive, onChat }: { groups: Group[]; agents: Agent[]; persistence: Health; onSave: (group: Group) => void; onArchive: (id: string) => void; onChat: (group: Group) => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [mode, setMode] = useState<Group["mode"]>("manual");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [participantRoles, setParticipantRoles] = useState<Record<string, string>>({});
  const [coordinatorId, setCoordinatorId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const enabled = agents.filter((agent) => agent.enabled);
  function save(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || !agentIds.length) return;
    const selectedCoordinator = coordinatorId && agentIds.includes(coordinatorId) ? coordinatorId : undefined;
    onSave({ id: editingId ?? crypto.randomUUID(), name: name.trim(), avatar, agentIds, mode, createdAt: groups.find((group) => group.id === editingId)?.createdAt ?? Date.now(), participantRoles, ...(selectedCoordinator ? { coordinatorId: selectedCoordinator } : {}) });
    setName(""); setAvatar(""); setAgentIds([]); setParticipantRoles({}); setCoordinatorId(""); setMode("manual"); setEditingId(null);
  }
  function edit(group: Group) { setEditingId(group.id); setName(group.name); setAvatar(group.avatar ?? ""); setMode(group.mode); setAgentIds(group.agentIds); setParticipantRoles(group.participantRoles ?? {}); setCoordinatorId(group.coordinatorId ?? ""); }
  return <div className="page-content">
    <div className="page-heading"><div><span className="section-label">ORQUESTRAÇÃO</span><h1>Grupos de agentes</h1><p>Monte equipes com perfis persistidos no PostgreSQL.</p></div></div>
    <div className="gallery-notice-pill">{persistence === "connected" ? "Grupos sincronizados com PostgreSQL." : "Backend indisponível: grupos ficam como rascunhos locais até a conexão retornar."}</div>
    <form className="agent-modal-dialog group-create-form" onSubmit={save}>
      <label><span>Nome do grupo</span><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Revisão de produto" /></label>
      <label><span>Avatar (URL ou imagem data URL)</span><input value={avatar} onChange={(event) => setAvatar(event.target.value)} placeholder="Opcional" /></label>
      <label><span>Modo de roteamento</span><select value={mode} onChange={(event) => setMode(event.target.value as Group["mode"])}><option value="manual">Manual — escolher agente ao conversar</option><option value="mention">Por menção — @nome direciona</option><option value="coordinated">Coordenado — coordenador recebe a solicitação</option></select></label>
      <fieldset><legend>Participantes e funções nesta equipe</legend>{enabled.length ? enabled.map((agent) => <div className="group-member-choice" key={agent.id}><input type="checkbox" aria-label={`Adicionar ${agent.name}`} checked={agentIds.includes(agent.id)} onChange={(event) => setAgentIds((ids) => event.target.checked ? [...ids, agent.id] : ids.filter((id) => id !== agent.id))} /><span><b>{agent.name}</b><small>{agent.role || agent.description || "Agente"}</small></span>{agentIds.includes(agent.id) && <input aria-label={`Função de ${agent.name} no grupo`} placeholder={agent.role || "Função no grupo"} value={participantRoles[agent.id] ?? ""} onChange={(event) => setParticipantRoles((roles) => ({ ...roles, [agent.id]: event.target.value }))} />}</div>) : <p>Crie e ative agentes antes de montar um grupo.</p>}</fieldset>
      {mode === "coordinated" && <label><span>Agente coordenador</span><select value={coordinatorId} onChange={(event) => setCoordinatorId(event.target.value)}><option value="">Escolha entre participantes</option>{enabled.filter((agent) => agentIds.includes(agent.id)).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role || "Agente"}</option>)}</select></label>}
      <button className="btn-primary-gold" type="submit" disabled={!name.trim() || agentIds.length === 0}><Plus size={15} /> {editingId ? "Salvar alterações" : "Criar grupo"}</button>
    </form>
    <div className="group-list">{groups.length ? groups.map((group) => <article className="group-card" key={group.id}><div className="group-card-head"><div>{group.avatar && <img className="group-avatar-image" src={group.avatar} alt="" />}<span className="section-label">{group.mode === "manual" ? "MANUAL" : group.mode === "mention" ? "MENÇÕES" : "COORDENADO"}</span><h2>{group.name}</h2></div><button className="icon-btn-close" onClick={() => onArchive(group.id)} aria-label={`Arquivar ${group.name}`}><X size={16} /></button></div><div className="group-members-summary">{group.agentIds.map((id) => { const agent = agents.find((item) => item.id === id); return agent ? <span key={id}>{agent.name}<small>{group.participantRoles?.[id] || agent.role || "Participante"}</small></span> : null; })}</div>{group.coordinatorId && <small>Coordenador: {agents.find((agent) => agent.id === group.coordinatorId)?.name ?? "não disponível"}</small>}<div className="agent-actions-group"><button className="btn-outline-sm" onClick={() => edit(group)}>Editar</button><button className="btn-outline-sm" onClick={() => onChat(group)} disabled={!group.agentIds.some((id) => enabled.some((agent) => agent.id === id))}><MessageSquare size={14} /> Abrir conversa</button></div></article>) : <EmptyState title="Nenhum grupo criado" text="Selecione agentes ativos para criar uma equipe persistente." />}</div>
  </div>;
}

/* =========================================================================
   GALERIA DE AGENTES (AI CONTROLLER GALLERY)
   ========================================================================= */
function AgentsPage({
  agents, remoteAgentIds, persistence, onCreate, onEdit, onToggle, onChat, onOpen
}: {
  agents: Agent[]; remoteAgentIds: string[]; persistence: "checking" | "connected" | "local" | "error";
  onCreate: () => void; onEdit: (agent: Agent) => void;
  onToggle: (id: string) => void; onChat: (id: string) => void; onOpen: (id: string) => void;
}) {
  const persistenceMessage = persistence === "connected"
    ? "PostgreSQL conectado: perfis sincronizados em tempo real."
    : "Modo Local: perfis e instruções salvos no armazenamento deste desktop.";

  return (
    <div className="page-content agents-gallery-page">
      <div className="page-header-row">
        <div>
          <span className="section-label">EQUIPE DE INTELIGÊNCIAS</span>
          <h1>Galeria de Agentes</h1>
          <p className="page-subtitle">Configure e comande agentes especializados com diretrizes, papéis e modelos dedicados.</p>
        </div>
        <button className="btn-primary-gold" onClick={onCreate}>
          <Plus size={16} />
          <span>Criar Agente</span>
        </button>
      </div>

      <div className="gallery-notice-pill">
        <ShieldCheck size={15} />
        <span>{persistenceMessage}</span>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          title="Monte sua equipe de agentes"
          text="Crie personas especializadas com instruções e objetivos distintos para tarefas específicas."
          action={
            <button className="btn-primary-gold" onClick={onCreate}>
              <Plus size={15} /> Criar primeiro agente
            </button>
          }
        />
      ) : (
        <div className="agents-gallery-grid">
          {agents.map((agent) => (
            <article className="agent-card-premium" key={agent.id}>
              <div className="agent-card-header">
                <div className="agent-avatar-wrap">
                  {agent.avatar ? <img className="agent-avatar-char-image" src={agent.avatar} alt="" /> : <span className="agent-avatar-char">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</span>}
                  <i className={"agent-badge-dot " + (agent.enabled ? "active" : "inactive")} />
                </div>
                <div className="agent-title-info">
                  {agent.role && <span className="agent-role-tag">{agent.role}</span>}
                  <button className="agent-link-title" onClick={() => onOpen(agent.id)}>
                    <h2>{agent.name}</h2>
                    <ArrowUpRight size={14} />
                  </button>
                  <span className="agent-model-tag">{agent.model || "Modelo padrão"}</span>
                </div>
                <button
                  className={"switch-toggle " + (agent.enabled ? "switch-on" : "")}
                  aria-label={agent.enabled ? "Desativar agente" : "Ativar agente"}
                  aria-pressed={agent.enabled}
                  onClick={() => onToggle(agent.id)}
                  title={agent.enabled ? "Agente ativo" : "Agente desativado"}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <p className="agent-card-desc">{agent.description || "Agente com diretrizes específicas do Grupo Jadson."}</p>

              <div className="agent-card-footer">
                <div className="agent-card-tags">
                  <span className="tag-pill">{remoteAgentIds.includes(agent.id) ? "PostgreSQL" : "Local"}</span>
                </div>
                <div className="agent-actions-group">
                  <button className="btn-outline-sm" onClick={() => onEdit(agent)}>Configurar</button>
                  <button className="btn-gold-sm" disabled={!agent.enabled} onClick={() => onChat(agent.id)}>
                    <MessageSquare size={13} />
                    <span>Conversar</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   PERFIL DETALHADO DO AGENTE
   ========================================================================= */
function AgentDetailPage({
  agent, conversations, persistence, onBack, onEdit, onChat, onOpenConversation
}: {
  agent: Agent; conversations: Conversation[]; persistence: "checking" | "connected" | "local" | "error";
  onBack: () => void; onEdit: () => void; onChat: () => void;
  onOpenConversation: (id: string) => void;
}) {
  const history = conversations.filter((conversation) => conversation.agentId === agent.id);
  const persistenceLabel = persistence === "connected" ? "Sincronização Ativa" : "Armazenado Localmente";

  return (
    <div className="page-content agent-detail-page">
      <button className="back-link-btn" onClick={onBack}>
        <ChevronLeft size={16} />
        <span>Voltar à galeria de agentes</span>
      </button>

      <section className="agent-detail-hero-box">
        <div className="agent-hero-avatar">{agent.name.trim().slice(0, 1).toUpperCase() || "A"}</div>
        <div className="agent-hero-info">
          <span className="section-label">PERFIL DE IA</span>
          <h1>{agent.name}</h1>
          <p>{agent.description || "Nenhuma descrição informada."}</p>
          <span className={"agent-detail-pill " + (agent.enabled ? "enabled" : "")}>
            <i />
            {agent.enabled ? "Ativo para seleção imediata" : "Desativado"}
          </span>
        </div>
        <div className="agent-hero-actions">
          <button className="btn-outline-sm" onClick={onEdit}>Editar Perfil</button>
          <button className="btn-gold-sm" disabled={!agent.enabled} onClick={onChat}>
            <MessageSquare size={14} />
            <span>Iniciar Conversa</span>
          </button>
        </div>
      </section>

      <div className="agent-detail-columns">
        <section className="detail-card">
          <div className="detail-card-header">
            <h3>Instruções de Sistema & Comportamento</h3>
            <BrainCircuit size={18} className="text-gold" />
          </div>
          <div className="instructions-body">
            <p>{agent.instructions.trim() || "Nenhuma instrução personalizada configurada."}</p>
          </div>
          <div className="detail-card-meta">
            <span>Modelo: <b>{agent.model || "Padrão do Provedor"}</b></span>
            <span>Persistência: <b>{persistenceLabel}</b></span>
          </div>
        </section>

        <section className="detail-card">
          <div className="detail-card-header">
            <h3>Conversas com este Agente ({history.length})</h3>
            <MessageSquare size={18} className="text-gold" />
          </div>
          {history.length === 0 ? (
            <div className="detail-empty">
              <span>Nenhuma conversa vinculada até o momento.</span>
              <button className="btn-gold-sm" disabled={!agent.enabled} onClick={onChat}>
                Iniciar primeira conversa
              </button>
            </div>
          ) : (
            <div className="agent-history-list">
              {history.slice(0, 6).map((conv) => (
                <button key={conv.id} className="history-row" onClick={() => onOpenConversation(conv.id)}>
                  <span>{conv.title || "Nova conversa"}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* =========================================================================
   PÁGINAS AUXILIARES (CONVERSAS, MODELOS, CONFIGURAÇÕES, ETC)
   ========================================================================= */
function ConversationsPage({ conversations, agents, onNew, onOpen }: { conversations: Conversation[]; agents: Agent[]; onNew: () => void; onOpen: (id: string) => void }) {
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  return (
    <div className="page-content conversations-page">
      <div className="page-header-row">
        <div>
          <span className="section-label">MEMÓRIA DE DIÁLOGOS</span>
          <h1>Conversas Salvas</h1>
          <p className="page-subtitle">Acesse e retome diálogos anteriores realizados neste dispositivo.</p>
        </div>
        <button className="btn-primary-gold" onClick={onNew}><Plus size={15} /> Nova conversa</button>
      </div>
      {conversations.length === 0 ? (
        <EmptyState title="Sua primeira conversa começa agora" text="Inicie um chat para arquivar diálogos e instruções." action={<button className="btn-primary-gold" onClick={onNew}><MessageSquare size={14} /> Começar conversa</button>} />
      ) : (
        <div className="conversations-grid">
          {conversations.map((conv) => (
            <button className="conv-card-premium" key={conv.id} onClick={() => onOpen(conv.id)}>
              <div className="conv-card-top">
                <span className="conv-icon-circle"><MessageSquare size={16} /></span>
                <span className="conv-date">{new Date(conv.updatedAt).toLocaleDateString()}</span>
              </div>
              <b>{conv.title || "Nova conversa"}</b>
              <small>{conv.messages.length} mensagens • {agentNames.get(conv.agentId ?? "") ?? "Assistente Geral"}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelsPage({ providers, onOpenChat }: { providers: ProviderStatus[] | null; onOpenChat: () => void }) {
  return (
    <div className="page-content">
      <div className="page-header-row">
        <div>
          <span className="section-label">GATEWAY DE INTELIGÊNCIA</span>
          <h1>Modelos & Provedores</h1>
          <p className="page-subtitle">Modelos de linguagem suportados pelo controlador Grupo Jadson.</p>
        </div>
        <button className="btn-primary-gold" onClick={onOpenChat}><MessageSquare size={15} /> Abrir Chat</button>
      </div>
      <div className="provider-grid">
        {providers === null ? (
          <EmptyState title="Modo Local Ativo" text="O aplicativo opera em modo local isolado enquanto o backend não está ativo." />
        ) : (
          providers.map((p) => (
            <article className="provider-card-box" key={p.id}>
              <div className="provider-card-top">
                <BrainCircuit size={22} className="text-gold" />
                <span className={"status-pill " + (p.configured ? "online" : "offline")}>{p.configured ? "Configurado" : "Pendente"}</span>
              </div>
              <h2>{p.name}</h2>
              <p>{p.configured ? "Chave de acesso detectada no ambiente seguro." : "Configure sua chave no arquivo de ambiente do backend para habilitar este provedor."}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsPage({ providers }: { providers: ProviderStatus[] | null }) {
  return (
    <div className="page-content settings-page">
      <div className="page-header-row">
        <div>
          <span className="section-label">PREFERÊNCIAS</span>
          <h1>Configurações do Sistema</h1>
          <p className="page-subtitle">Parâmetros operacionais e segurança de credenciais.</p>
        </div>
      </div>
      <article className="settings-box">
        <h3>Segurança de Chaves e Credenciais</h3>
        <p>As chaves de provedores de IA são armazenadas estritamente no ambiente do servidor backend e nunca trafegam em código compilado no frontend.</p>
        <div className="security-notice">
          <ShieldCheck size={18} />
          <span>Diretório de Dados: <code>.runtime/webview2-data</code> isolado localmente no drive T:</span>
        </div>
      </article>
      <MemorySettings />
      <ModelSettings />
      <IntegrationSettings />
      <AccessSettings />
    </div>
  );
}

type ModelField = { name: "modelo_chave" | "modelo_endereco" | "modelo_padrao"; label: string; hint: string; secret: boolean; placeholder: string };

const MODEL_FIELDS: ModelField[] = [
  {
    name: "modelo_chave",
    label: "Chave do modelo",
    hint: "Chave da API do provedor. Fica cifrada neste computador e não aparece de novo depois de salva.",
    secret: true,
    placeholder: "Cole a chave aqui",
  },
  {
    name: "modelo_endereco",
    label: "Endereço do modelo",
    hint: "Deixe vazio para usar a OpenAI. Para outro provedor compatível, informe o endereço completo.",
    secret: false,
    placeholder: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  },
  {
    name: "modelo_padrao",
    label: "Nome do modelo",
    hint: "Modelo usado nas conversas quando nenhum for escolhido. Ex.: gemini-2.0-flash",
    secret: false,
    placeholder: "gpt-4o-mini",
  },
];

/** Configurações do modelo de IA que responde no chat. Cada campo é salvo e pode ser removido. */
function ModelSettings() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [savedField, setSavedField] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/integrations`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("integrations"))))
      .then((state: Record<string, { configured: boolean }>) => {
        setStatus(Object.fromEntries(Object.entries(state).map(([name, item]) => [name, item.configured])));
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível verificar o modelo de IA."); });
    return () => controller.abort();
  }, [version]);

  async function save(name: string) {
    const value = (values[name] ?? "").trim();
    if (!value) return;
    const response = await apiFetch(`${API_URL}/integrations/${name}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: value }),
    });
    if (response.ok) {
      setValues((current) => ({ ...current, [name]: "" }));
      setError(null);
      setSavedField(name);
      window.setTimeout(() => setSavedField((current) => (current === name ? null : current)), 3000);
      setVersion((v) => v + 1);
    } else {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "Não foi possível salvar.");
    }
  }

  async function remove(name: string) {
    const response = await apiFetch(`${API_URL}/integrations/${name}`, { method: "DELETE" });
    if (response.ok) { setError(null); setVersion((v) => v + 1); } else setError("Não foi possível remover.");
  }

  return (
    <article className="settings-box">
      <h3>Modelo de IA</h3>
      <p>É o modelo que responde no chat. Sem ele, o chat não gera respostas. Você pode usar a OpenAI ou outro provedor compatível.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      {MODEL_FIELDS.map((field) => {
        const configured = status?.[field.name];
        return (
          <div key={field.name} style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            <div className="workspace-fact">
              <span>{field.label}</span>
              <b>{status === null ? "Verificando..." : configured ? "Configurado" : "Não configurado"}</b>
            </div>
            <small style={{ opacity: 0.7 }}>{field.hint}</small>
            <div className="security-notice" style={{ alignItems: "center" }}>
              <input
                type={field.secret ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                placeholder={configured ? (field.secret ? "•••••••• salva (digite para trocar)" : "Trocar") : field.placeholder}
                autoComplete="off"
                style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
              />
              {savedField === field.name && <span role="status" style={{ color: "#d4af37", whiteSpace: "nowrap" }}>Salvo ✓</span>}
              <button className="btn-primary-gold" onClick={() => void save(field.name)} disabled={!(values[field.name] ?? "").trim()}>Salvar</button>
              {configured && <button className="icon-btn-close" onClick={() => void remove(field.name)}>Remover</button>}
            </div>
          </div>
        );
      })}
    </article>
  );
}

/** Chave do Tavily para busca na web. Depois de salva, a tela só mostra se está configurada. */
function IntegrationSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/integrations`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("integrations"))))
      .then((state: { tavily: { configured: boolean } }) => setConfigured(state.tavily.configured))
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível verificar a busca na web."); });
    return () => controller.abort();
  }, [version]);

  async function save() {
    const value = key.trim();
    if (!value) return;
    const response = await apiFetch(`${API_URL}/integrations/tavily`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: value }),
    });
    if (response.ok) { setKey(""); setError(null); setVersion((v) => v + 1); }
    else { const data = (await response.json().catch(() => ({}))) as { message?: string }; setError(data.message ?? "Não foi possível salvar a chave."); }
  }

  async function remove() {
    const response = await apiFetch(`${API_URL}/integrations/tavily`, { method: "DELETE" });
    if (response.ok) { setError(null); setVersion((v) => v + 1); } else setError("Não foi possível remover a chave.");
  }

  return (
    <article className="settings-box">
      <h3>Busca na web (Tavily)</h3>
      <p>Usada pelos agentes para pesquisar na internet. A chave fica salva neste computador e não aparece de novo depois de salva.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      <div className="workspace-fact">
        <span>Status</span>
        <b>{configured === null ? "Verificando..." : configured ? "Configurada" : "Não configurada"}</b>
      </div>
      <div className="security-notice" style={{ alignItems: "center" }}>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={configured ? "Trocar a chave" : "Cole a chave do Tavily"}
          autoComplete="off"
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
        />
        <button className="btn-primary-gold" onClick={save} disabled={!key.trim()}>Salvar</button>
        {configured && <button className="icon-btn-close" onClick={remove}>Remover</button>}
      </div>
    </article>
  );
}

type PersonEntry = { id: string; name: string; role: "admin" | "operator" | "viewer"; active: boolean };
const ROLE_LABELS: Record<PersonEntry["role"], string> = { admin: "Administrador", operator: "Operador", viewer: "Leitor" };

/** Pessoas e papéis. O token de cada pessoa aparece uma única vez, ao criar ou trocar. */
function AccessSettings() {
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<PersonEntry["role"]>("operator");
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/users`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("users"))))
      .then((list: PersonEntry[]) => { setPeople(list); setError(null); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as pessoas. Só administradores veem esta lista."); });
    return () => controller.abort();
  }, [version]);

  /** Envia uma alteração e atualiza a lista; mostra a mensagem do backend quando recusar. */
  async function send(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data?: unknown }> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await apiFetch(`${API_URL}${path}`, init);
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) { setError(data.message ?? "Não foi possível concluir a ação."); return { ok: false }; }
    setError(null);
    setVersion((value) => value + 1);
    return { ok: true, data };
  }

  async function create() {
    const cleanName = name.trim();
    if (!cleanName) return;
    const result = await send("/users", "POST", { name: cleanName, role });
    if (result.ok) {
      const data = result.data as { user: PersonEntry; token: string };
      setNewToken({ name: data.user.name, token: data.token });
      setName("");
    }
  }

  async function rotate(person: PersonEntry) {
    const result = await send(`/users/${person.id}/token`, "POST");
    if (result.ok) {
      const data = result.data as { token: string };
      setNewToken({ name: person.name, token: data.token });
    }
  }

  return (
    <article className="settings-box">
      <h3>Pessoas e acessos</h3>
      <p>Cada pessoa tem um token próprio. Leitor só consulta; operador usa o sistema; administrador também gerencia pessoas.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      {newToken && (
        <div className="security-notice" role="status">
          <span>
            Token de <b>{newToken.name}</b>, mostrado só agora: <code style={{ wordBreak: "break-all" }}>{newToken.token}</code>
          </span>
          <button className="icon-btn-close" onClick={() => setNewToken(null)}>Fechar</button>
        </div>
      )}
      <div className="security-notice" style={{ alignItems: "center" }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome da pessoa"
          maxLength={80}
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
        />
        <select value={role} onChange={(event) => setRole(event.target.value as PersonEntry["role"])} aria-label="Papel">
          <option value="operator">Operador</option>
          <option value="viewer">Leitor</option>
          <option value="admin">Administrador</option>
        </select>
        <button className="btn-primary-gold" onClick={create} disabled={!name.trim()}>Adicionar</button>
      </div>
      {people.map((person) => (
        <div className="workspace-fact" key={person.id}>
          <b>{person.name} · {ROLE_LABELS[person.role]}{person.active ? "" : " (inativo)"}</b>
          <span style={{ display: "flex", gap: 6 }}>
            <select
              value={person.role}
              onChange={(event) => void send(`/users/${person.id}/role`, "PUT", { role: event.target.value })}
              aria-label={`Papel de ${person.name}`}
            >
              <option value="operator">Operador</option>
              <option value="viewer">Leitor</option>
              <option value="admin">Administrador</option>
            </select>
            <button className="icon-btn-close" onClick={() => void rotate(person)}>Novo token</button>
            <button className="icon-btn-close" onClick={() => void send(`/users/${person.id}/active`, "PUT", { active: !person.active })}>
              {person.active ? "Desativar" : "Ativar"}
            </button>
          </span>
        </div>
      ))}
    </article>
  );
}

type MemoryEntry = { id: string; content: string; createdAt: string };

/** Memória: o que a pessoa pediu para lembrar. Desligada, nada disso vai para o modelo. */
function MemorySettings() {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<MemoryEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/memory`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("memory"))))
      .then((state: { enabled: boolean; items: MemoryEntry[] }) => { setEnabled(state.enabled); setItems(state.items); setError(null); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar a memória."); });
    return () => controller.abort();
  }, [version]);

  async function toggle() {
    const next = !enabled;
    const response = await apiFetch(`${API_URL}/memory/enabled`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }),
    });
    if (response.ok) setEnabled(next); else setError("Não foi possível alterar a memória.");
  }

  async function add() {
    const content = draft.trim();
    if (!content) return;
    const response = await apiFetch(`${API_URL}/memory`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
    if (response.ok) { setDraft(""); setVersion((value) => value + 1); } else setError("Não foi possível salvar essa memória.");
  }

  async function forget(id: string) {
    const response = await apiFetch(`${API_URL}/memory/${id}`, { method: "DELETE" });
    if (response.ok) setVersion((value) => value + 1); else setError("Não foi possível esquecer essa memória.");
  }

  return (
    <article className="settings-box">
      <h3>Memória</h3>
      <p>O que você pedir para lembrar entra como contexto nas conversas. Você pode desligar a memória ou apagar cada item.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      <div className="workspace-fact">
        <span>Memória {enabled ? "ligada" : "desligada"}</span>
        <button className={"switch-toggle " + (enabled ? "switch-on" : "")} aria-pressed={enabled} aria-label={enabled ? "Desligar memória" : "Ligar memória"} onClick={toggle}>
          <span className="switch-thumb" />
        </button>
      </div>
      <div className="security-notice" style={{ alignItems: "center" }}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ex.: prefiro respostas curtas"
          maxLength={500}
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
        />
        <button className="btn-primary-gold" onClick={add} disabled={!draft.trim()}>Lembrar</button>
      </div>
      {items.length === 0 ? (
        <p>Nada salvo ainda.</p>
      ) : (
        items.map((item) => (
          <div className="workspace-fact" key={item.id}>
            <b>{item.content}</b>
            <button className="icon-btn-close" onClick={() => forget(item.id)}>Esquecer</button>
          </div>
        ))
      )}
    </article>
  );
}

type ApprovalItem = { id: string; action: string; summary: string; status: "pending" | "approved" | "rejected"; requestedBy: string; decidedBy: string | null; createdAt: string };
type AuditItem = { id: string; actor: string; action: string; subject: string | null; createdAt: string };

const AUDIT_LABELS: Record<string, string> = {
  "chat.completion": "Resposta gerada",
  "approval.requested": "Aprovação solicitada",
  "approval.approved": "Aprovação concedida",
  "approval.rejected": "Aprovação recusada",
  "handoff.created": "Delegação entre agentes",
  "tool.run": "Ferramenta executada",
};

/** Atividades: solicitações de aprovação pendentes e a trilha de auditoria recente. */
function ActivityPage() {
  const [pending, setPending] = useState<ApprovalItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [usage, setUsage] = useState<{ agentId: string | null; totalTokens: number; calls: number }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch(`${API_URL}/approvals?status=pending`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("approvals")))),
      apiFetch(`${API_URL}/audit?limit=30`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("audit")))),
      apiFetch(`${API_URL}/usage/summary?days=30`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("usage")))),
    ])
      .then(([approvals, events, summary]) => {
        setPending(approvals as ApprovalItem[]);
        setAudit(events as AuditItem[]);
        setUsage((summary as { agents: typeof usage }).agents);
        setLoadError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError("Não foi possível carregar as atividades. Esta tela precisa do PostgreSQL ligado (DATABASE_URL)."); });
    return () => controller.abort();
  }, [version]);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      const response = await apiFetch(`${API_URL}/approvals/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, decidedBy: "Jadson" }),
      });
      if (!response.ok) throw new Error("decision");
      setVersion((value) => value + 1);
    } catch {
      setLoadError("Não foi possível registrar a decisão. Tente de novo.");
    }
  }

  return (
    <div className="page-content monitoring-page">
      <div className="page-header-row">
        <div>
          <span className="section-label">ATIVIDADES</span>
          <h1>Aprovações e auditoria</h1>
          <p className="page-subtitle">Ações sensíveis esperam sua decisão. Todo evento fica registrado.</p>
        </div>
      </div>

      {loadError && <div className="gallery-notice-pill" role="alert">{loadError}</div>}

      <section className="settings-box">
        <h3>Aguardando aprovação</h3>
        {pending.length === 0 ? (
          <p>Nada pendente.</p>
        ) : (
          pending.map((item) => (
            <div className="security-notice" key={item.id}>
              <div style={{ flex: 1 }}>
                <b>{item.action}</b>
                <div>{item.summary}</div>
                <small>Solicitado por {item.requestedBy}</small>
              </div>
              <button className="btn-primary-gold" onClick={() => decide(item.id, "approved")}>Aprovar</button>
              <button className="icon-btn-close" onClick={() => decide(item.id, "rejected")}>Recusar</button>
            </div>
          ))
        )}
      </section>

      <RoutinesSection />
      <AgentPoliciesSection />

      <section className="settings-box">
        <h3>Consumo de tokens (últimos 30 dias)</h3>
        {usage.length === 0 ? (
          <p>Nenhum consumo registrado no período.</p>
        ) : (
          usage.map((row) => (
            <div className="workspace-fact" key={row.agentId ?? "sem-agente"}>
              <span>{row.calls} chamada{row.calls === 1 ? "" : "s"}</span>
              <b>{row.agentId ? `Agente ${row.agentId.slice(0, 8)}` : "Sem agente"} · {row.totalTokens.toLocaleString("pt-BR")} tokens</b>
            </div>
          ))
        )}
      </section>

      <section className="settings-box">
        <h3>Trilha de auditoria</h3>
        {audit.length === 0 ? (
          <p>Nenhum evento registrado ainda.</p>
        ) : (
          audit.map((event) => (
            <div className="workspace-fact" key={event.id}>
              <span>{new Date(event.createdAt).toLocaleString("pt-BR")} · {event.actor}</span>
              <b>{AUDIT_LABELS[event.action] ?? event.action}</b>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

type RoutineEntry = { id: string; name: string; tool: string; intervalMinutes: number; enabled: boolean; nextRunAt: string; lastStatus: string | null };

/** Rotinas: uma ferramenta de leitura roda sozinha a cada N minutos. Sensíveis não entram aqui. */
function RoutinesSection() {
  const [routines, setRoutines] = useState<RoutineEntry[]>([]);
  const [tools, setTools] = useState<{ name: string; description: string; risk: string }[]>([]);
  const [name, setName] = useState("");
  const [tool, setTool] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch(`${API_URL}/routines`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("routines")))),
      apiFetch(`${API_URL}/tools`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("tools")))),
    ])
      .then(([list, catalog]) => {
        setRoutines(list as RoutineEntry[]);
        const readOnly = (catalog as { name: string; description: string; risk: string }[]).filter((item) => item.risk === "read");
        setTools(readOnly);
        setTool((current) => current || readOnly[0]?.name || "");
        setError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as rotinas."); });
    return () => controller.abort();
  }, [version]);

  async function send(path: string, method: string, body?: unknown): Promise<boolean> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await apiFetch(`${API_URL}${path}`, init);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "Não foi possível concluir a ação.");
      return false;
    }
    setError(null);
    setVersion((value) => value + 1);
    return true;
  }

  async function create() {
    if (!name.trim() || !tool) return;
    const ok = await send("/routines", "POST", { name: name.trim(), tool, intervalMinutes: minutes });
    if (ok) setName("");
  }

  return (
    <section className="settings-box">
      <h3>Rotinas</h3>
      <p>Uma ferramenta de leitura roda sozinha no intervalo escolhido. Ferramentas que alteram dados precisam de aprovação e não entram aqui.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      <div className="security-notice" style={{ alignItems: "center" }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome da rotina"
          maxLength={80}
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
        />
        <select value={tool} onChange={(event) => setTool(event.target.value)} aria-label="Ferramenta">
          {tools.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <input type="number" min={1} max={1440} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} aria-label="Intervalo em minutos" style={{ width: 70, background: "transparent", color: "inherit" }} />
        <span>min</span>
        <button className="btn-primary-gold" onClick={create} disabled={!name.trim() || !tool}>Agendar</button>
      </div>
      {routines.length === 0 ? (
        <p>Nenhuma rotina agendada.</p>
      ) : (
        routines.map((routine) => (
          <div className="workspace-fact" key={routine.id}>
            <b>{routine.name} · {routine.tool} a cada {routine.intervalMinutes} min{routine.enabled ? "" : " (pausada)"}</b>
            <span style={{ display: "flex", gap: 6 }}>
              <button className="icon-btn-close" onClick={() => void send(`/routines/${routine.id}/enabled`, "PUT", { enabled: !routine.enabled })}>
                {routine.enabled ? "Pausar" : "Retomar"}
              </button>
              <button className="icon-btn-close" onClick={() => void send(`/routines/${routine.id}`, "DELETE")}>Apagar</button>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

function AgentPoliciesSection() {
  const [agentList, setAgentList] = useState<{ id: string; name: string }[]>([]);
  const [tools, setTools] = useState<{ name: string; description: string; risk: string }[]>([]);
  const [agentId, setAgentId] = useState("");
  const [rules, setRules] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch(`${API_URL}/agents`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("agents")))),
      apiFetch(`${API_URL}/tools`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("tools")))),
    ])
      .then(([agents, catalog]) => {
        const list = (agents as { id: string; name: string }[]).map((agent) => ({ id: agent.id, name: agent.name }));
        setAgentList(list);
        setTools(catalog as { name: string; description: string; risk: string }[]);
        setAgentId((current) => current || list[0]?.id || "");
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar os agentes."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!agentId) return;
    const controller = new AbortController();
    apiFetch(`${API_URL}/agents/${agentId}/policies`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("policies"))))
      .then((list: { tool: string; decision: string }[]) => {
        setRules(Object.fromEntries(list.map((item) => [item.tool, item.decision])));
        setError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as regras."); });
    return () => controller.abort();
  }, [agentId]);

  async function change(tool: string, value: string) {
    const url = `${API_URL}/agents/${agentId}/policies/${encodeURIComponent(tool)}`;
    const response = value === "ask"
      ? await apiFetch(url, { method: "DELETE" })
      : await apiFetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: value }) });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "Não foi possível salvar a regra.");
      return;
    }
    setError(null);
    setRules((current) => {
      const next = { ...current };
      if (value === "ask") delete next[tool];
      else next[tool] = value;
      return next;
    });
  }

  return (
    <section className="settings-box">
      <h3>Permissões dos agentes</h3>
      <p>Escolha o que cada agente pode fazer sem perguntar. Sem regra, ferramentas de leitura rodam e as que alteram dados pedem aprovação.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      {agentList.length === 0 ? (
        <p>Nenhum agente cadastrado.</p>
      ) : (
        <>
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)} aria-label="Agente">
            {agentList.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          {tools.map((tool) => (
            <div className="workspace-fact" key={tool.name}>
              <b>{tool.name} <span>{tool.risk === "sensitive" ? "(altera dados)" : "(leitura)"}</span></b>
              <select value={rules[tool.name] ?? "ask"} onChange={(event) => void change(tool.name, event.target.value)} aria-label={`Regra para ${tool.name}`}>
                <option value="ask">Perguntar (padrão)</option>
                <option value="allow">Permitir sem perguntar</option>
                <option value="deny">Recusar</option>
              </select>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function MonitoringPage({ health, postgres, vector, redis, providerCount }: { health: Health; postgres: Health; vector: Health; redis: Health; providerCount: number | null }) {
  return (
    <div className="page-content monitoring-page">
      <div className="page-header-row">
        <div>
          <span className="section-label">OBSERVABILIDADE</span>
          <h1>Monitoramento de Infraestrutura</h1>
          <p className="page-subtitle">Verificações de integridade em tempo real dos serviços locais.</p>
        </div>
      </div>
      <div className="monitoring-cards-grid">
        <MonitoringItem label="API NestJS" status={health} detail="Comunicação HTTP/SSE" />
        <MonitoringItem label="PostgreSQL" status={postgres} detail="Persistência relacional" />
        <MonitoringItem label="pgvector" status={vector} detail="Busca vetorial" />
        <MonitoringItem label="Redis" status={redis} detail="Fila e cache" />
      </div>
    </div>
  );
}

function MonitoringItem({ label, status, detail }: { label: string; status: Health; detail: string }) {
  return (
    <div className="monitoring-card">
      <div className="monitoring-card-header">
        <b>{label}</b>
        <span className={`status-dot ${status}`} />
      </div>
      <small>{detail}</small>
      <span className={"status-label " + status}>{status === "connected" ? "Ativo" : status === "checking" ? "Verificando" : "Modo Local"}</span>
    </div>
  );
}

/* =========================================================================
   MODAIS & HELPERS
   ========================================================================= */
function AgentModal({ agent, onChange, onClose, onSubmit }: { agent: Agent; onChange: (agent: Agent) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="agent-modal-dialog" onSubmit={onSubmit}>
        <div className="modal-header">
          <div>
            <span className="section-label">PERSONA DE IA</span>
            <h2>{agent.name ? "Editar Agente" : "Novo Agente"}</h2>
          </div>
          <button type="button" className="icon-btn-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-fields">
          <label><span>Cargo / função</span><input value={agent.role ?? ""} onChange={(event) => onChange({ ...agent, role: event.target.value })} placeholder="Ex.: Coordenador de Projetos" /></label>
          <label><span>Departamento</span><input value={agent.department ?? ""} onChange={(event) => onChange({ ...agent, department: event.target.value })} placeholder="Ex.: Engenharia" /></label>
          <label><span>Avatar (URL ou imagem data URL)</span><input value={agent.avatar ?? ""} onChange={(event) => onChange({ ...agent, avatar: event.target.value })} placeholder="https://… ou data:image/png;base64,…" /></label>
          <label><span>Especialidades (separadas por vírgula)</span><input value={(agent.specialties ?? []).join(", ")} onChange={(event) => onChange({ ...agent, specialties: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="TypeScript, UX, pesquisa" /></label>
          <label><span>Provider</span><select value={agent.provider ?? "openai"} onChange={(event) => onChange({ ...agent, provider: event.target.value })}><option value="openai">OpenAI</option></select></label>
          <label>
            <span>Nome do Agente</span>
            <input required autoFocus value={agent.name} onChange={(event) => onChange({ ...agent, name: event.target.value })} placeholder="Ex.: Analista Financeiro, Especialista em Código" />
          </label>
          <label>
            <span>Especialidade / Descrição Curta</span>
            <input value={agent.description} onChange={(event) => onChange({ ...agent, description: event.target.value })} placeholder="Ex.: Especialista em refatoração e arquitetura" />
          </label>
          <label>
            <span>Instruções de Sistema (Prompt Base)</span>
            <textarea rows={4} value={agent.instructions} onChange={(event) => onChange({ ...agent, instructions: event.target.value })} placeholder="Como este agente deve responder, estruturar informações e se comportar?" />
          </label>
          <label>
            <span>Modelo Específico (Opcional)</span>
            <input value={agent.model} onChange={(event) => onChange({ ...agent, model: event.target.value })} placeholder="Ex.: gpt-4o, claude-3-5-sonnet" />
          </label>
          <label><span>Temperatura (0 a 2)</span><input type="number" min="0" max="2" step="0.1" value={agent.generationConfig?.temperature ?? ""} onChange={(event) => onChange({ ...agent, generationConfig: { ...agent.generationConfig, ...(event.target.value ? { temperature: Number(event.target.value) } : {}) } })} placeholder="Padrão do provider" /></label>
          <label><span>Limite de tokens</span><input type="number" min="1" max="32000" step="1" value={agent.generationConfig?.maxTokens ?? ""} onChange={(event) => onChange({ ...agent, generationConfig: { ...agent.generationConfig, ...(event.target.value ? { maxTokens: Number(event.target.value) } : {}) } })} placeholder="Padrão do provider" /></label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-outline-sm" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary-gold"><Check size={15} /> Salvar Agente</button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state-box">
      <div className="empty-icon-circle"><Sparkles size={22} className="text-gold" /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
  return url && file.type.startsWith("image/") ? <img className="attachment-thumb" src={url} alt="" /> : <Paperclip size={12} />;
}

function ComingSoonPage({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  const item = [...NAV, ...SECONDARY_NAV].find((nav) => nav.id === page);
  const Icon = item?.icon ?? CircleHelp;
  return (
    <div className="page-content">
      <div className="placeholder-box">
        <Icon size={28} className="text-gold" />
        <h2>{item?.label}</h2>
        <p>Módulo de orquestração em fase de expansão. Funcionalidades integradas em tempo real conforme disponibilidade da API.</p>
        <button className="btn-primary-gold" onClick={() => onNavigate("dashboard")}><Gauge size={15} /> Voltar ao Início</button>
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let code: string[] = [];
  let inCode = false;
  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(<pre className="code-block" key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
        code = []; inCode = false;
      } else inCode = true;
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
