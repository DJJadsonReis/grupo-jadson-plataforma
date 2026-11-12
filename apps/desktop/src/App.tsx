import { SettingsBoldIcon, LogoutBoldIcon, MonitorBoldIcon, ShieldKeyholeBoldIcon, LockBoldIcon, ChartBoldIcon, RefreshBoldIcon } from "@solar-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { normalizeAgent, parseWorkspace, toStringList, serializeWorkspace, type Agent, type ChatMessage, type Conversation, type Group } from "./lib/workspace";
import { plainPreview } from "./lib/preview";
import { AgentAvatar } from "./components/AgentAvatar";
import {
  Activity, ArrowUp, ArrowUpRight, Image, Mic, Plug, Bot, Boxes, BrainCircuit, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, Cpu, FileText, FolderOpen, Gauge, Layers, ListTodo, LoaderCircle, MessageSquare, Paperclip,
  PanelRight, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Square, Star, Workflow, X, Maximize2, Minimize2, LogOut, LayoutGrid } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import logo from "./assets/grupo-jadson-logo.png";

type PageId = "dashboard" | "chat" | "agents" | "agent-detail" | "conversations" | "groups" | "computers" | "memory" | "automations" | "tools" | "models" | "files" | "activity" | "monitoring" | "settings";
type Health = "checking" | "connected" | "unavailable";
type ProviderStatus = { id: string; name: string; configured: boolean };

const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3333/api/v1";

/** Mascotes animados do Grupo Jadson (pasta public/mascotes, cópia de mascotes-jadson/animados). */
const MASCOTES = [
  "01-nuvem", "02-redondo", "03-quadrado-arredondado", "04-diamante", "05-estrela", "06-flor", "07-hexagono",
  "08-escudo", "09-chama", "10-gota", "11-triangulo", "12-engrenagem", "13-capsula",
].map((name) => `/mascotes/${name}.svg`);
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

/**
 * Token do sistema, usado só em desenvolvimento. O servidor do Vite entrega em tempo de execução
 * (ver vite.config.ts); em produção não existe token do sistema no app: vale só a sessão de login.
 */
let devTokenRequest: Promise<string> | null = null;
function devSystemToken(): Promise<string> {
  if (!import.meta.env.DEV) return Promise.resolve("");
  if (!devTokenRequest) {
    devTokenRequest = fetch("/__gj/dev-token", { cache: "no-store" })
      .then((r): Promise<{ token?: string }> => (r.ok ? r.json() : Promise.resolve({})))
      .then((body) => body.token ?? "")
      .catch(() => "")
      .then((token) => {
        if (!token) devTokenRequest = null; // tenta de novo na próxima chamada
        return token;
      });
  }
  return devTokenRequest;
}

/** Envia a sessão (se houver) ou, em desenvolvimento, o token do sistema em todas as chamadas ao backend. */
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readSession() ?? (await devSystemToken());
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

const SIDEBAR_DEFAULT_WIDTH = 248;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;

function clampSidebarWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

/** Prévia de uma linha: o último texto da conversa, sem quebras de linha. */
function lastMessagePreview(conversation: Conversation): string {
  const last = [...conversation.messages].reverse().find((message) => message.content.trim().length > 0);
  return last ? plainPreview(last.content) : "Sem mensagens";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".account-menu, .sidebar-person")) return;
      setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [accountOpen]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((value) => !value); }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
  const [pendingConversation, setPendingConversation] = useState<Conversation | null>(null);
  const [historyMenu, setHistoryMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);

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

  async function deleteConversation(id: string) {
    const item = conversations.find((c) => c.id === id);
    if (!item) return;
    try {
      const response = await apiFetch(`${API_URL}/conversations/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("falhou");
    } catch {
      setHistoryNotice("Não foi possível excluir a conversa. Tente de novo.");
      window.setTimeout(() => setHistoryNotice(null), 3000);
      return;
    }
    setConversations((items) => items.filter((c) => c.id !== id));
    if (activeConversation === id) { setActiveConversation(null); setPage("conversations"); }
    setHistoryNotice("Conversa excluída.");
    window.setTimeout(() => setHistoryNotice(null), 2500);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("grupo-jadson.sidebar-collapsed.v2") === "true");
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem("grupo-jadson.focus-mode") === "true");
  const [agentSearch, setAgentSearch] = useState("");
  const [favoriteAgentIds, setFavoriteAgentIds] = useState<string[]>(readFavoriteAgents);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => conversations.find((c) => c.id === activeConversation) ?? (pendingConversation && pendingConversation.id === activeConversation ? pendingConversation : null), [conversations, activeConversation, pendingConversation]);

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
        let remote = (await response.json() as unknown[]).map(normalizeAgent).filter((agent): agent is Agent => agent !== null);
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
            const saved = normalizeAgent(await created.json());
            if (!saved) throw new Error("Resposta inválida ao migrar um agente local.");
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
  useEffect(() => { localStorage.setItem("grupo-jadson.sidebar-collapsed.v2", String(sidebarCollapsed)); }, [sidebarCollapsed]);
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
    setPendingConversation(conversation);
    setActiveConversation(conversation.id);
    setPage("chat");
    setError(null);
    setMobileOpen(false);
  }

  function openAgentProfile(id: string) { setViewedAgentId(id); setPage("agent-detail"); setMobileOpen(false); }

  function changePage(next: PageId) {
    setPage(next);
    setMobileOpen(false);
  }

  async function sendMessage(contentInput: string, model: string, agent: Agent | undefined, selectedFiles: File[] = [], titleHint?: string) {
    const content = contentInput.trim();
    const title = (titleHint ?? content).trim();
    if ((!content && !selectedFiles.length) || busy) return;
    let conversationId = activeConversation;
    if (pendingConversation && pendingConversation.id === activeConversation) {
      setConversations((items) => [{ ...pendingConversation, title: (title || "Nova conversa").slice(0, 48) }, ...items]);
      setPendingConversation(null);
    }
    if (!conversationId) {
      const conversation: Conversation = { id: crypto.randomUUID(), title: title.slice(0, 48), messages: [], updatedAt: Date.now() };
      conversationId = conversation.id;
      setActiveConversation(conversationId);
      setConversations((items) => [conversation, ...items]);
    }
    const id = conversationId;
    const userMessage: ChatMessage = { role: "user", content: content || "Analise a imagem anexada." };
    const current = conversations.find((item) => item.id === id) ?? (pendingConversation && pendingConversation.id === id ? pendingConversation : undefined);
    // Mensagens de erro são só para a tela: não voltam ao modelo.
    const prior = (current?.messages ?? []).filter((message) => !message.error);
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
      const reason = cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem.";
      // O erro vira uma mensagem dentro da conversa, no lugar da resposta que não chegou.
      setConversations((items) => items.map((item) => item.id === id ? {
        ...item,
        messages: [
          ...item.messages.filter((message) => message.role !== "assistant" || message.content.length > 0),
          ...(aborted ? [] : [{ role: "assistant" as const, content: "", error: reason, ...(agent ? { agentId: agent.id } : {}) }]),
        ],
      } : item));
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
  function agentPreview(agentId: string): string {
    const last = conversations.filter((c) => c.agentId === agentId && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return last ? lastMessagePreview(last) : "Sem conversas ainda";
  }
  const railCollapsed = sidebarCollapsed && !sidebarHover;
  function toggleFavoriteAgent(id: string) { setFavoriteAgentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  return (
    <div className={`app-shell flex min-h-dvh ${sidebarCollapsed ? "app-shell-collapsed" : ""} ${focusMode ? "app-shell-focus" : ""}`} style={{ "--sidebar-width": `${sidebarCollapsed ? 72 : sidebarWidth}px` } as CSSProperties}>
      <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Abrir menu"><Boxes size={19} /></button>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        agents={agents}
        conversations={conversations}
        onOpenConversation={(id) => { setActiveConversation(id); setPage("chat"); }}
        onChatWithAgent={(id) => newConversation(id)}
        onNewConversation={() => newConversation()}
        onNavigate={(target) => setPage(target)}
      />
      {mobileOpen && <button className="scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      {connectOpen && <ConnectAppsDialog onClose={() => setConnectOpen(false)} onOpenSettings={() => { setConnectOpen(false); changePage("settings"); }} />}

      {/* SIDEBAR PREMIUM */}
      <aside
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${railCollapsed ? "sidebar-collapsed" : ""} ${sidebarCollapsed && !railCollapsed ? "sidebar-hover-open" : ""}`}
        style={sidebarCollapsed && !railCollapsed ? { width: 260, zIndex: 60, boxShadow: "8px 0 24px rgba(0,0,0,0.45)" } : undefined}
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      >
        {!railCollapsed && (
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
          <button className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={railCollapsed ? "Expandir menu" : "Recolher menu"} title={railCollapsed ? "Expandir menu" : "Recolher menu"}>
            {railCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* BUSCA DE CONVERSAS: fica em cima de Nova conversa */}
        {!railCollapsed && (
          <label className="history-search">
            <Search size={13} />
            <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Buscar conversas" aria-label="Buscar conversas" />
          </label>
        )}

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
              title={railCollapsed ? label : undefined}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* HISTÓRICO DE CONVERSAS: busca e lista recente, logo abaixo da navegação */}
        {!railCollapsed && (
          <div className="history">
            <div className="sidebar-section-header">
              <span className="section-label">CONVERSAS</span>
            </div>
            <div className="history-list">
              {groups
                .filter((group) => group.name.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase()))
                .map((group) => {
                  const last = conversations.filter((c) => c.groupId === group.id && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];
                  return (
                    <button key={"team-" + group.id} className="history-item history-agent history-team" onClick={() => newConversation(undefined, group.id)} title={group.name} aria-label={"Conversar com a equipe " + group.name}>
                      <span className="agent-avatar">{group.avatar ? <img src={group.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : group.name.trim().slice(0, 1).toUpperCase() || "E"}</span>
                      <span className="history-copy">
                        <strong>{group.name}<span className="agent-role-chip">Equipe · {group.agentIds.length} bots</span></strong>
                        <small>{last ? lastMessagePreview(last) : "Sem mensagens ainda"}</small>
                      </span>
                    </button>
                  );
                })}
              {agents
                .filter((agent) => agent.name.toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase()))
                .map((agent) => (
                  <button key={"agent-" + agent.id} className="history-item history-agent" onClick={() => agent.enabled && newConversation(agent.id)} disabled={!agent.enabled} title={agent.name} aria-label={"Conversar com " + agent.name}>
                    <AgentAvatar agent={agent} />
                    <span className="history-copy">
                      <strong>{agent.name}{agent.role ? <span className="agent-role-chip">{agent.role}</span> : null}</strong>
                      <small>{activeAgentId === agent.id ? "Em execução…" : agentPreview(agent.id)}</small>
                    </span>
                  </button>
                ))}
              {conversations
                .filter((item) => item.messages.length > 0)
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
              {historyNotice && (
                <div role="status" className="gallery-notice-pill" style={{ margin: "8px 0" }}>{historyNotice}</div>
              )}
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



        {/* NAVEGAÇÃO SECUNDÁRIA INFERIOR */}

        {accountOpen && (
          <div className="account-menu" role="menu">
            <button role="menuitem" className="account-menu-item" onClick={() => { setAccountOpen(false); changePage("activity"); }}>Atividades</button>
            <button role="menuitem" className="account-menu-item" onClick={() => { setAccountOpen(false); changePage("settings"); }}>Configurações</button>
            <button role="menuitem" className="account-menu-item" onClick={signOutThisComputer}>Sair</button>
          </div>
        )}
        <div className="sidebar-person">
          <span className="sidebar-person-avatar" aria-hidden="true">J</span>
          <button className="sidebar-person-name" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen} aria-haspopup="menu">Jadson</button>
          <button className="sidebar-person-connect" onClick={() => setConnectOpen(true)} aria-label="Conectar aplicativos" title="Conectar aplicativos">
            <LayoutGrid size={15} />
          </button>
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
            onOpenAutomations={() => setPage("automations")}
            onEditAgent={setAgentEditor}
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
            onNew={() => newConversation()}
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
                    <AgentAvatar agent={agent} size="md" />
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
/** Leitura em voz alta da resposta: usa a síntese de voz do navegador (gratuita). Some quando o sistema não oferece. */
function ReadAloudButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  if (!supported) return null;

  function toggle() {
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`>]/g, " "));
    utterance.lang = "pt-BR";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <button type="button" className="read-aloud-btn" onClick={toggle} aria-pressed={speaking} title={speaking ? "Parar leitura" : "Ouvir resposta"}>
      {speaking ? "Parar" : "Ouvir"}
    </button>
  );
}

/** Ditado por voz: usa o reconhecimento de voz do navegador (gratuito). Some quando o sistema não oferece. */
type SpeechRecognitionLike = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> & { length: number } }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function DictateButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike });
  const Recognition = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition;
  if (!Recognition) return null;

  function toggle() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognition = new Recognition!();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) onText(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <button type="button" className={"toolbar-btn" + (listening ? " is-listening" : "")} onClick={toggle} title={listening ? "Parar ditado" : "Ditar mensagem"} aria-label={listening ? "Parar ditado" : "Ditar mensagem"} aria-pressed={listening}>
      <Mic size={16} />
    </button>
  );
}

/** Busca rápida (Ctrl+K): bots, conversas, ações e telas. */
function CommandPalette({ open, onClose, agents, conversations, onOpenConversation, onChatWithAgent, onNewConversation, onNavigate }: {
  open: boolean; onClose: () => void; agents: Agent[]; conversations: Conversation[];
  onOpenConversation: (id: string) => void; onChatWithAgent: (id: string) => void;
  onNewConversation: () => void; onNavigate: (page: PageId) => void;
}) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const q = query.trim().toLowerCase();
  const has = (text: string) => text.toLowerCase().includes(q);
  const bots = agents.filter((agent) => has(agent.name)).slice(0, 6);
  const chats = conversations.filter((item) => item.messages.length > 0 && has(item.title || "")).slice(0, 6);
  const pages = ([
    { id: "chat", label: "Conversas" }, { id: "agents", label: "Galeria de Agentes" },
    { id: "automations", label: "Rotinas" }, { id: "settings", label: "Configurações" },
  ] as { id: PageId; label: string }[]).filter((page) => has(page.label));
  const done = (action: () => void) => { action(); setQuery(""); onClose(); };

  return (
    <div className="cmdk-overlay" onClick={() => { setQuery(""); onClose(); }}>
      <div className="cmdk" role="dialog" aria-label="Buscar" onClick={(event) => event.stopPropagation()}>
        <div className="cmdk-input">
          <Search size={16} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar bots, chats, configurações..." />
        </div>
        <div className="cmdk-list">
          {bots.length > 0 && <small className="cmdk-group">Bots</small>}
          {bots.map((agent) => (
            <button key={agent.id} className="cmdk-item" onClick={() => done(() => onChatWithAgent(agent.id))}>
              <AgentAvatar agent={agent} size="sm" />
              <span className="cmdk-copy"><strong>{agent.name}</strong><small>{agent.role || agent.description || "Agente"}</small></span>
            </button>
          ))}
          {chats.length > 0 && <small className="cmdk-group">Conversas</small>}
          {chats.map((item) => (
            <button key={item.id} className="cmdk-item" onClick={() => done(() => onOpenConversation(item.id))}>
              <MessageSquare size={16} />
              <span className="cmdk-copy"><strong>{item.title || "Nova conversa"}</strong></span>
            </button>
          ))}
          <small className="cmdk-group">Ações</small>
          <button className="cmdk-item" onClick={() => done(onNewConversation)}><Plus size={16} /><span className="cmdk-copy"><strong>Nova conversa</strong></span></button>
          <button className="cmdk-item" onClick={() => done(() => onNavigate("settings"))}><Plug size={16} /><span className="cmdk-copy"><strong>Conectar aplicativos</strong><small>Chaves de serviços e modelo de IA em Configurações</small></span></button>
          {pages.length > 0 && <small className="cmdk-group">Telas</small>}
          {pages.map((page) => (
            <button key={page.id} className="cmdk-item" onClick={() => done(() => onNavigate(page.id))}>
              <ChevronRight size={16} /><span className="cmdk-copy"><strong>{page.label}</strong></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatPage({
  conversation, agents, groups, draft, busy, activeAgentId, error, files,
  setDraft, setFiles, onSend, onCancel, onDismissError, onChooseFiles, inputRef, focusMode, setFocusMode, onOpenAutomations, onEditAgent
}: {
  onOpenAutomations: () => void;
  onEditAgent: (agent: Agent) => void;
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
  const [contextTab, setContextTab] = useState<"activity" | "library">("activity");
  const [libraryFilter, setLibraryFilter] = useState<"all" | "media" | "files">("all");
  const libraryItems = (conversation?.messages ?? []).flatMap((message) =>
    (Array.isArray(message.attachments) ? message.attachments : []).filter((file) => file && file.name).map((file) => ({ ...file, when: message.timestamp ?? 0 })));
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const isMedia = (type: string) => type.startsWith("image/") || type.startsWith("video/");
  const shownItems = libraryItems.filter((file) => libraryFilter === "all" || (libraryFilter === "media" ? isMedia(file.type) : !isMedia(file.type)));
  const recent = shownItems.filter((file) => !file.when || Date.now() - file.when < WEEK);
  const older = shownItems.filter((file) => file.when && Date.now() - file.when >= WEEK);
  const libraryFiles = shownItems;
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
    <div className={"chat-page gx-chat " + (workspaceOpen ? "chat-workspace-open " : "") + (conversation?.messages.length ? "" : "is-empty")}>
      {/* CABEÇALHO MÍNIMO: só o título e as ações de conversa */}
      <header className="gx-header">
        <h1 className="gx-title" title={currentGroup ? `${currentGroup.name} · ${conversation?.title ?? "Nova conversa"}` : conversation?.title ?? "Nova conversa"}>
          {selectedAgent && <AgentAvatar agent={selectedAgent} size="xs" className="gx-title-avatar" />}
          {currentGroup ? `${currentGroup.name} · ${conversation?.title ?? "Nova conversa"}` : conversation?.title ?? "Nova conversa"}
        </h1>
        <div className="gx-header-actions">
          {conversation && conversation.messages.length > 0 && (
            <button
              type="button"
              className={"gx-icon-btn " + (delegateOpen ? "is-active" : "")}
              onClick={() => (delegateOpen ? (setDelegateOpen(false), setDelegateError(null)) : setDelegateOpen(true))}
              aria-expanded={delegateOpen}
              aria-label="Delegar conversa a outro agente"
              title="Delegar conversa a outro agente"
            >
              <Bot size={16} />
            </button>
          )}
          <button
            className="gx-icon-btn"
            onClick={() => setFocusMode((value) => !value)}
            aria-pressed={focusMode}
            aria-label={focusMode ? "Sair do modo foco" : "Ativar modo foco"}
            title={focusMode ? "Sair do modo foco (Esc)" : "Modo foco: oculta menus laterais"}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            className={"gx-icon-btn " + (workspaceOpen ? "is-active" : "")}
            onClick={() => setWorkspaceOpen((open) => !open)}
            aria-expanded={workspaceOpen}
            aria-label="Painel de contexto"
            title="Painel de contexto"
          >
            <PanelRight size={16} />
          </button>
        </div>
      </header>

      {delegateOpen && conversation && conversation.messages.length > 0 && (
        <div className="gx-delegate" role="group" aria-label="Delegar conversa">
          <select value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)} aria-label="Agente de destino">
            <option value="">Escolha um agente</option>
            {agents.filter((agent) => agent.enabled && agent.id !== agentId).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <button type="button" className="gx-text-btn gx-text-btn-strong" disabled={!delegateTo || delegating} onClick={delegate}>
            {delegating ? "Delegando…" : "Confirmar"}
          </button>
          <button type="button" className="gx-text-btn" onClick={() => { setDelegateOpen(false); setDelegateError(null); }}>Cancelar</button>
          {delegateError && <small className="gx-delegate-error" role="alert">{delegateError}</small>}
        </div>
      )}

      {/* FLUXO DA CONVERSA: coluna central de leitura */}
      <div className="gx-scroll" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const images = Array.from(event.dataTransfer.files).filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type)); setFiles([...files, ...images]); }}>
        <div className="gx-column">
          {!conversation?.messages.length ? (
            <div className="gx-empty">
              <img src={logo} alt="" className="gx-empty-logo" />
              <h2>O que vamos construir hoje?</h2>
              <p>Envie instruções, analise dados ou peça ajuda a um agente da equipe.</p>
              <div className="gx-prompts">
                {[
                  { title: "Verificar serviços", desc: "Consultar conexões e APIs disponíveis", prompt: "Quais serviços e bancos de dados estão conectados no momento?" },
                  { title: "Consultar agentes", desc: "Listar perfis e especialidades ativas", prompt: "Quais agentes de IA estão configurados para operar comigo?" },
                  { title: "Elaborar plano de ação", desc: "Estruturar etapas para nova meta", prompt: "Ajude-me a estruturar um plano de ação completo para uma nova iniciativa." },
                  { title: "Analisar código e arquitetura", desc: "Revisar estrutura e boas práticas", prompt: "Quais são as melhores práticas para orquestração de IA moderna?" }
                ].map((item) => (
                  <button key={item.title} className="gx-prompt" onClick={() => setDraft(item.prompt)}>
                    <b>{item.title}</b>
                    <small>{item.desc}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="gx-thread">
              {conversation.messages.map((message, index) => {
                const isLast = index === conversation.messages.length - 1;
                if (message.role === "user") {
                  return (
                    <div className="gx-turn gx-turn-user" key={index + "-user"}>
                      {(Array.isArray(message.attachments) ? message.attachments : []).map((attachment) => attachment?.dataUrl && <img key={attachment.id} className="gx-attachment" src={attachment.dataUrl} alt={attachment.name} onClick={() => window.open(attachment.dataUrl, "_blank", "noopener,noreferrer")} />)}
                      <div className="gx-user-bubble">{message.content}</div>
                    </div>
                  );
                }
                if (message.error) {
                  return (
                    <div className="gx-turn gx-turn-error" role="alert" key={index + "-error"}>
                      <CircleHelp size={16} />
                      <p>{message.error}</p>
                    </div>
                  );
                }
                // Resposta vazia enquanto o modelo ainda não respondeu: o indicador "Pensando" ocupa o lugar.
                if (!message.content) return isLast && busy ? <ThinkingTurn key={index + "-thinking"} agent={runningAgent ?? selectedAgent} /> : null;
                const author = agents.find((item) => item.id === message.agentId);
                return (
                  <div className="gx-turn gx-turn-assistant" key={index + "-assistant"}>
                    <div className="gx-turn-head">
                      <AuthorAvatar agent={author} />
                      <span className="gx-turn-name">{author?.name ?? "Grupo Jadson"}</span>
                      <ReadAloudButton text={message.content} />
                    </div>
                    <div className="gx-turn-body">
                      <MarkdownContent content={message.content} />
                    </div>
                  </div>
                );
              })}
              {busy && conversation.messages[conversation.messages.length - 1]?.role !== "assistant" && <ThinkingTurn agent={runningAgent ?? selectedAgent} />}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* COMPOSER FIXO NO RODAPÉ, NA MESMA LARGURA DA COLUNA */}
      <div className="gx-dock">
        <div className="gx-column">
          {error && (
            <div className="gx-notice" role="alert">
              <span>{error}</span>
              <button type="button" onClick={onDismissError} aria-label="Fechar aviso"><X size={14} /></button>
            </div>
          )}

          {files.length > 0 && (
            <div className="gx-chips">
              {files.map((file) => (
                <span key={file.name + "-" + file.size} className="gx-chip">
                  <FilePreview file={file} />
                  {file.name}
                  <button type="button" onClick={() => setFiles(files.filter((item) => item !== file))} aria-label="Remover anexo">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {pdfDocs.length > 0 && (
            <div className="gx-chips">
              {pdfDocs.map((doc) => (
                <span key={doc.id} className="gx-chip">
                  {doc.name} · {doc.pages} página{doc.pages === 1 ? "" : "s"}
                  <button type="button" onClick={() => setPdfDocs((items) => items.filter((item) => item.id !== doc.id))} aria-label="Remover PDF">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {pdfError && <div className="gx-notice" role="alert" onClick={() => setPdfError(null)}>{pdfError}</div>}

          <form
            className="gx-composer"
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
              placeholder="Mensagem para o Grupo Jadson"
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
            {mentionQuery !== undefined && <div className="mention-suggestions" role="listbox">{availableAgents.filter((agent) => agent.name.toLocaleLowerCase().includes(mentionQuery.toLocaleLowerCase())).map((agent) => <button type="button" key={agent.id} role="option" onClick={() => setDraft(draft.replace(/@[^\s@]*$/, `@${agent.name} `))}><AgentAvatar agent={agent} size="xs" /><span><b>{agent.name}</b><small>{agent.role || agent.description || "Agente"}</small></span></button>)}</div>}

            <div className="gx-toolbar">
              <div className="gx-tools">
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
                <button type="button" className="gx-icon-btn" onClick={onChooseFiles} title="Anexar imagem ou PDF" aria-label="Anexar imagem ou PDF">
                  <Paperclip size={16} />
                </button>
                <DictateButton onText={(text) => setDraft(draft ? `${draft} ${text}` : text)} />
                <label className="gx-pill" title="Modelo usado nesta conversa">
                  <Sparkles size={13} />
                  <input className="gx-pill-input" aria-label="ID do modelo" placeholder="Modelo padrão" value={model} onChange={(event) => setModel(event.target.value)} />
                </label>
                <label className="gx-pill" title="Agente que responde">
                  {selectedAgent && <AgentAvatar agent={selectedAgent} size="xs" />}
                  <select className="gx-pill-select" aria-label="Perfil associado" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                    <option value="">Sem perfil</option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {busy ? (
                <button type="button" className="gx-send is-stop" onClick={onCancel} title="Parar geração" aria-label="Parar geração">
                  <Square size={13} />
                </button>
              ) : (
                <button type="submit" className="gx-send" disabled={!draft.trim() && files.length === 0} title="Enviar mensagem" aria-label="Enviar mensagem">
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </form>
          <p className="gx-disclaimer">O histórico fica neste dispositivo. As respostas dependem do modelo configurado em Configurações.</p>
        </div>
      </div>

      {/* WORKSPACE PANEL FLUTUANTE */}
      {workspaceOpen && (
        <aside className="chat-workspace-panel" id="chat-workspace" aria-label="Contexto da conversa">
          <div className="workspace-panel-heading">
            <div className="ctx-agent-head">
              <button type="button" className="ctx-avatar-button" onClick={() => selectedAgent && onEditAgent(selectedAgent)} aria-label="Editar avatar" title="Editar avatar" disabled={!selectedAgent}>{selectedAgent?.avatar ? <img className="ctx-avatar ctx-avatar-image" src={selectedAgent.avatar} alt="" /> : <span className="ctx-avatar">{(selectedAgent?.name ?? "G").trim().slice(0, 1).toUpperCase()}</span>}<span className="ctx-avatar-overlay">Editar avatar</span></button>
              <div>
                <h2>{selectedAgent?.name ?? "Assistente Geral"}</h2>
                <small>{selectedAgent?.role || "Conversa com o Grupo Jadson"}</small>
              </div>
            </div>
            <button className="icon-btn-close" onClick={() => setWorkspaceOpen(false)} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>

          <div className="ctx-tabs" role="tablist">
            <button role="tab" aria-selected={contextTab === "activity"} className={contextTab === "activity" ? "active" : ""} onClick={() => setContextTab("activity")}>Atividade</button>
            <button role="tab" aria-selected={contextTab === "library"} className={contextTab === "library" ? "active" : ""} onClick={() => setContextTab("library")}>Biblioteca</button>
          </div>

          {contextTab === "library" && (
            <div className="ctx-library">
              <div className="ctx-filters" role="group" aria-label="Filtrar arquivos">
                {([["all", "Todos"], ["media", "Mídia"], ["files", "Arquivos"]] as const).map(([key, label]) => (
                  <button key={key} className={libraryFilter === key ? "active" : ""} onClick={() => setLibraryFilter(key)}>{label}</button>
                ))}
              </div>
              {libraryFiles.length === 0 ? (
                <p className="ctx-empty">Nenhum arquivo nesta conversa ainda.</p>
              ) : (
                <>
                  {recent.length > 0 && <small className="ctx-group-label">Esta semana</small>}
                  {recent.map((file) => (
                    <div className="ctx-file" key={file.id}>
                      {isMedia(file.type) ? <Image size={15} /> : <FileText size={15} />}
                      <span>{file.name}</span>
                    </div>
                  ))}
                  {older.length > 0 && <small className="ctx-group-label">Mais antigos</small>}
                  {older.map((file) => (
                    <div className="ctx-file" key={file.id}>
                      {isMedia(file.type) ? <Image size={15} /> : <FileText size={15} />}
                      <span>{file.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {contextTab === "activity" && <>
          <div className="ctx-suggestions">
            <div className="ctx-suggestions-head"><span>Sugestões</span></div>
            <button className="ctx-suggestion" onClick={onOpenAutomations}>
              <Clock3 size={15} /><span>Criar uma rotina</span><ChevronRight size={14} />
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
          </>}
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
  const [view, setView] = useState<"gallery" | "org">("gallery");
  const sectors = new Map<string, Agent[]>();
  for (const agent of agents) {
    const key = agent.department?.trim() || "Sem setor";
    sectors.set(key, [...(sectors.get(key) ?? []), agent]);
  }

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

      <div className="org-view-toggle" role="tablist" aria-label="Modo de visualização">
        <button role="tab" aria-selected={view === "gallery"} className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}>Galeria</button>
        <button role="tab" aria-selected={view === "org"} className={view === "org" ? "active" : ""} onClick={() => setView("org")}>Organograma</button>
      </div>

      {view === "org" && agents.length > 0 && (
        <div className="org-sectors">
          {[...sectors.entries()].map(([sector, members]) => (
            <section className="org-sector" key={sector}>
              <header className="org-sector-head">
                <span className="section-label">SETOR</span>
                <h2>{sector}</h2>
                <small>{members.length} {members.length === 1 ? "agente" : "agentes"}</small>
              </header>
              <div className="org-sector-members">
                {members.map((agent) => (
                  <button className="org-member" key={agent.id} onClick={() => onOpen(agent.id)}>
                    <AgentAvatar agent={agent} size="sm" />
                    <span className="org-member-copy">
                      <strong>{agent.name}</strong>
                      <small>{agent.role || agent.description || "Sem função definida"}</small>
                    </span>
                    <i className={"agent-badge-dot " + (agent.enabled ? "active" : "inactive")} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === "gallery" && agents.length === 0 ? (
        <EmptyState
          title="Monte sua equipe de agentes"
          text="Crie personas especializadas com instruções e objetivos distintos para tarefas específicas."
          action={
            <button className="btn-primary-gold" onClick={onCreate}>
              <Plus size={15} /> Criar primeiro agente
            </button>
          }
        />
      ) : view === "gallery" ? (
        <div className="agents-gallery-grid">
          {agents.map((agent) => (
            <article className="agent-card-premium" key={agent.id}>
              <div className="agent-card-header">
                <div className="agent-avatar-wrap">
                  <AgentAvatar agent={agent} size="lg" />
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
      ) : null}
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
        <button type="button" className="agent-hero-avatar-button" onClick={onEdit} aria-label="Editar avatar" title="Editar avatar">
          <AgentAvatar agent={agent} size="xl" className="agent-hero-avatar" />
          <span className="agent-hero-avatar-overlay">Editar avatar</span>
        </button>
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

type SettingsTab = "geral" | "computador" | "permissoes" | "cofre" | "uso" | "atualizacoes";
const SETTINGS_TABS: { id: SettingsTab; label: string; icon: typeof SettingsBoldIcon }[] = [
  { id: "geral", label: "Geral", icon: SettingsBoldIcon },
  { id: "computador", label: "Computador", icon: MonitorBoldIcon },
  { id: "permissoes", label: "Permissões", icon: ShieldKeyholeBoldIcon },
  { id: "cofre", label: "Cofre", icon: LockBoldIcon },
  { id: "uso", label: "Uso e cobrança", icon: ChartBoldIcon },
  { id: "atualizacoes", label: "Atualizações", icon: RefreshBoldIcon },
];

/** Consumo dos últimos 30 dias, por agente. Mesmo dado de Atividades; mostra o total e cada agente. */
function UsageSettings() {
  const [rows, setRows] = useState<{ agentId: string | null; totalTokens: number; calls: number }[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch(`${API_URL}/usage/summary?days=30`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("usage")))),
      apiFetch(`${API_URL}/agents`, { signal: controller.signal }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([summary, agents]) => {
        setRows((summary as { agents: { agentId: string | null; totalTokens: number; calls: number }[] }).agents ?? []);
        setNames(Object.fromEntries((agents as { id: string; name: string }[]).map((agent) => [agent.id, agent.name])));
        setError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar o consumo. Esta tela precisa do PostgreSQL ligado."); });
    return () => controller.abort();
  }, []);

  const totalTokens = (rows ?? []).reduce((sum, row) => sum + row.totalTokens, 0);
  const totalCalls = (rows ?? []).reduce((sum, row) => sum + row.calls, 0);

  return (
    <article className="settings-box">
      <h3>Uso e cobrança</h3>
      <p>Consumo dos últimos 30 dias.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      {rows && (
        <>
          <div className="usage-totals">
            <div><span>Tokens</span><b>{totalTokens.toLocaleString("pt-BR")}</b></div>
            <div><span>Chamadas</span><b>{totalCalls.toLocaleString("pt-BR")}</b></div>
          </div>
          {rows.length === 0 ? <small className="sidebar-empty">Nenhum uso registrado ainda.</small> : (
            <div className="usage-rows">
              {rows.map((row) => (
                <div className="workspace-fact" key={row.agentId ?? "sem-agente"}>
                  <span>{row.agentId ? names[row.agentId] ?? "Agente removido" : "Sem agente"}</span>
                  <b>{row.totalTokens.toLocaleString("pt-BR")} tokens · {row.calls} chamadas</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** Configurações em abas laterais: cada aba mostra só o seu assunto. */
function SettingsPage({ providers }: { providers: ProviderStatus[] | null }) {
  const [tab, setTab] = useState<SettingsTab>("geral");
  return (
    <div className="page-content settings-page">
      <div className="page-header-row">
        <div>
          <h1>Configurações</h1>
        </div>
      </div>
      <div className="settings-tabs-layout">
        <nav className="settings-tabs" aria-label="Seções de configurações">
          {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} className={`settings-tab ${tab === id ? "active" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-tab-panel">
          {tab === "geral" && (
            <>
              <article className="settings-box">
                <h3>Conta</h3>
                <p>Você está usando o Grupo Jadson neste computador.</p>
                <div className="security-notice" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <span>Sair desta conta libera o computador para outra pessoa entrar.</span>
                  <button type="button" className="icon-btn-close" onClick={signOutThisComputer}>Sair</button>
                </div>
              </article>
              <MemorySettings />
            </>
          )}
          {tab === "computador" && (
            <article className="settings-box">
              <h3>Computador do Bot</h3>
              <p>Os agentes só leem e alteram arquivos dentro da pasta de trabalho do projeto (<code>workspace</code>). Qualquer escrita pede a sua aprovação antes.</p>
            </article>
          )}
          {tab === "permissoes" && <AccessSettings />}
          {tab === "cofre" && (
            <>
              <article className="settings-box">
                <h3>Chaves de segurança</h3>
                <p>As chaves ficam cifradas no servidor e não aparecem de novo depois de salvas.</p>
              </article>
              <ModelSettings />
              <IntegrationSettings />
              <NotionSettings />
              <GoogleSettings />
            </>
          )}
          {tab === "uso" && <UsageSettings />}
          {tab === "atualizacoes" && (
            <>
              <article className="settings-box">
                <h3>Atualizações</h3>
                <p className="version-line">
                  Versão instalada: 0.1.0
                  <span className="beta-badge" title="Esta versão ainda está em teste">Versão beta</span>
                </p>
              </article>
              <article className="settings-box credits-box">
                <h3>Créditos</h3>
                <p>Desenvolvido por <strong>DJ Jadson Reis</strong>.</p>
                <nav className="credits-links" aria-label="Redes do DJ Jadson Reis">
                  <a href="https://instagram.com/falajadson" target="_blank" rel="noopener noreferrer" onClick={(event) => { event.preventDefault(); window.open("https://instagram.com/falajadson", "_blank", "noopener,noreferrer"); }}>Instagram · @falajadson</a>
                  <a href="https://x.com/djjadsonreis" target="_blank" rel="noopener noreferrer" onClick={(event) => { event.preventDefault(); window.open("https://x.com/djjadsonreis", "_blank", "noopener,noreferrer"); }}>X · @djjadsonreis</a>
                </nav>
              </article>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Encerra a sessão deste computador e volta para a tela de entrada. */
function signOutThisComputer() {
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* sem armazenamento */ }
  window.location.reload();
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

/** Notion: cole o token da integração criada em notion.so/my-integrations. Fica cifrado no servidor. */
function NotionSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/integrations`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("integrations"))))
      .then((state: { notion: { configured: boolean } }) => setConfigured(state.notion.configured))
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível verificar o Notion."); });
    return () => controller.abort();
  }, [version]);

  async function save() {
    const value = token.trim();
    if (!value) return;
    const response = await apiFetch(`${API_URL}/integrations/notion`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: value }),
    });
    if (response.ok) { setToken(""); setError(null); setVersion((v) => v + 1); }
    else { const data = (await response.json().catch(() => ({}))) as { message?: string }; setError(data.message ?? "Não foi possível salvar o token."); }
  }

  async function remove() {
    const response = await apiFetch(`${API_URL}/integrations/notion`, { method: "DELETE" });
    if (response.ok) { setError(null); setVersion((v) => v + 1); } else setError("Não foi possível remover o token.");
  }

  return (
    <article className="settings-box">
      <h3>Notion</h3>
      <p>Permite que os agentes pesquisem e criem páginas no seu Notion, depois da sua aprovação. Compartilhe as páginas com a integração no próprio Notion.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      <div className="workspace-fact">
        <span>Status</span>
        <b>{configured === null ? "Verificando..." : configured ? "Configurado" : "Não configurado"}</b>
      </div>
      <div className="security-notice" style={{ alignItems: "center" }}>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={configured ? "Trocar o token" : "Cole o token secreto do Notion"}
          autoComplete="off"
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "inherit", font: "inherit" }}
        />
        <button className="btn-primary-gold" onClick={save} disabled={!token.trim()}>Salvar</button>
        {configured && <button className="icon-btn-close" onClick={remove}>Remover</button>}
      </div>
    </article>
  );
}

/** Conta Google: liga Drive e Agenda para a pessoa que está usando o app. */
function GoogleSettings() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/google/status`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((state: { connected: boolean }) => setConnected(state.connected))
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível verificar a conta Google."); });
    return () => controller.abort();
  }, [version]);

  async function connect() {
    setError(null);
    const response = await apiFetch(`${API_URL}/google/connect`);
    if (!response.ok) { setError("Não foi possível iniciar a conexão com o Google."); return; }
    const data = (await response.json()) as { url: string };
    await invoke("open_external", { url: data.url });
    setWaiting(true);
  }

  async function disconnect() {
    const response = await apiFetch(`${API_URL}/google/connection`, { method: "DELETE" });
    if (response.ok) { setWaiting(false); setError(null); setVersion((v) => v + 1); } else setError("Não foi possível desconectar.");
  }

  return (
    <article className="settings-box">
      <h3>Google (Drive e Agenda)</h3>
      <p>Permite que os agentes vejam seus próximos eventos e arquivos recentes do Drive, e criem eventos na sua Agenda depois da sua aprovação.</p>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      <div className="workspace-fact">
        <span>Status</span>
        <b>{connected === null ? "Verificando..." : connected ? "Conectada" : waiting ? "Aguardando você concluir no navegador" : "Não conectada"}</b>
      </div>
      <div className="security-notice" style={{ alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        {connected ? (
          <button className="icon-btn-close" onClick={disconnect}>Desconectar</button>
        ) : (
          <button className="btn-primary-gold" onClick={connect}>Conectar Google</button>
        )}
        {waiting && !connected && <button className="icon-btn-close" onClick={() => setVersion((v) => v + 1)}>Já conectei</button>}
      </div>
    </article>
  );
}

/** Conectar aplicativos. Notion e Google abrem Configurações, onde ficam os tokens e a conta. Os demais aparecem só como lista. */
const CONNECT_APPS: { nome: string; categoria: string; ligado: boolean; chave?: "notion" | "google" }[] = [
  { nome: "Notion", categoria: "Produtividade", ligado: true, chave: "notion" },
  { nome: "Google (Drive e Agenda)", categoria: "Produtividade", ligado: true, chave: "google" },
  { nome: "Atlassian", categoria: "Produtividade", ligado: false },
  { nome: "Outlook", categoria: "Comunicação", ligado: false },
  { nome: "AgentMail", categoria: "Comunicação", ligado: false },
  { nome: "1Password", categoria: "Gerenciadores de senha", ligado: false },
  { nome: "Vercel", categoria: "Código", ligado: false },
  { nome: "Supabase", categoria: "Código", ligado: false },
  { nome: "Cloudflare", categoria: "Código", ligado: false },
  { nome: "Datadog", categoria: "Código", ligado: false },
];
const CONNECT_CATEGORIES = ["Todos", "Gerenciadores de senha", "Produtividade", "Comunicação", "Código"];

function ConnectAppsDialog({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [status, setStatus] = useState<{ notion: boolean; google: boolean }>({ notion: false, google: false });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${API_URL}/integrations`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("integrations"))))
      .then((state: { notion: { configured: boolean } }) => setStatus((s) => ({ ...s, notion: state.notion.configured })))
      .catch(() => undefined);
    apiFetch(`${API_URL}/google/status`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((state: { connected: boolean }) => setStatus((s) => ({ ...s, google: state.connected })))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const connected = [status.notion, status.google].filter(Boolean).length;
  const term = query.trim().toLowerCase();
  const items = CONNECT_APPS.filter((app) => (category === "Todos" || app.categoria === category) && app.nome.toLowerCase().includes(term));

  return (
    <div className="connect-scrim" onClick={onClose}>
      <section className="connect-dialog" role="dialog" aria-modal="true" aria-label="Conectar aplicativos" onClick={(event) => event.stopPropagation()}>
        <header className="connect-head">
          <h2>Conectar aplicativos</h2>
          <span className="connect-count">{connected} conectados</span>
          <button className="icon-btn-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </header>
        <label className="connect-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em aplicativos" aria-label="Buscar em aplicativos" />
        </label>
        <div className="connect-chips">
          {CONNECT_CATEGORIES.map((item) => (
            <button key={item} className={`connect-chip ${category === item ? "active" : ""}`} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <div className="connect-list">
          {items.map((app) => {
            const on = app.chave ? status[app.chave] : false;
            return (
              <div className="connect-row" key={app.nome}>
                <span className="connect-name">{app.nome}</span>
                {app.ligado ? (
                  <button className="connect-btn" onClick={onOpenSettings}>{on ? "Conectado" : "Conectar"}</button>
                ) : (
                  <button className="connect-btn" disabled>Em breve</button>
                )}
              </div>
            );
          })}
          {items.length === 0 && <p className="connect-empty">Nenhum aplicativo encontrado.</p>}
        </div>
      </section>
    </div>
  );
}

/** Foto do bot na lista; se a imagem não carregar, mostra a inicial no mesmo círculo. */
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
      <form className="bot-create-dialog" onSubmit={onSubmit}>
        <div className="modal-header">
          <h2>{agent.name ? "Editar Bot" : "Criar novo Bot"}</h2>
          <button type="button" className="icon-btn-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="bot-create-body">
          <div className="bot-preview"><img src={agent.avatar || MASCOTES[0]} alt="" /></div>
          <input className="bot-name-input" required autoFocus value={agent.name} onChange={(event) => onChange({ ...agent, name: event.target.value })} placeholder="Dê um nome ao seu Bot" aria-label="Nome do Bot" />
          <div className="mascot-grid bot-mascot-grid" role="radiogroup" aria-label="Escolha o mascote">
            {MASCOTES.map((src) => (
              <button type="button" key={src} role="radio" aria-checked={agent.avatar === src} className={`mascot-option ${agent.avatar === src ? "selected" : ""}`} onClick={() => onChange({ ...agent, avatar: src })} title={src.split("/").pop()}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <details className="bot-advanced">
            <summary>Configurações avançadas</summary>
            <div className="modal-fields">
              <label><span>Cargo / função</span><input value={agent.role ?? ""} onChange={(event) => onChange({ ...agent, role: event.target.value })} placeholder="Ex.: Coordenador de Projetos" /></label>
              <label><span>Departamento</span><input value={agent.department ?? ""} onChange={(event) => onChange({ ...agent, department: event.target.value })} placeholder="Ex.: Engenharia" /></label>
              <label><span>Avatar (URL ou imagem data URL)</span><input value={agent.avatar ?? ""} onChange={(event) => onChange({ ...agent, avatar: event.target.value })} placeholder="https://… ou data:image/png;base64,…" /></label>
              <SpecialtiesInput value={toStringList(agent.specialties)} onChange={(specialties) => onChange({ ...agent, specialties })} />
              <label><span>Provider</span><select value={agent.provider ?? "openai"} onChange={(event) => onChange({ ...agent, provider: event.target.value })}><option value="openai">OpenAI</option></select></label>
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
          </details>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-outline-sm" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary-gold">{agent.name ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    </div>
  );
}

/** Texto livre das especialidades: guarda o que foi digitado (com vírgulas no meio) e envia a lista limpa. */
function SpecialtiesInput({ value, onChange }: { value: string[]; onChange: (list: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <label>
      <span>Especialidades (separadas por vírgula)</span>
      <input
        value={text}
        onChange={(event) => { setText(event.target.value); onChange(toStringList(event.target.value)); }}
        placeholder="TypeScript, UX, pesquisa"
      />
    </label>
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

/** Indicador de espera dentro do fluxo, no lugar da resposta que ainda não chegou. */
function ThinkingTurn({ agent }: { agent?: Agent | undefined }) {
  return (
    <div className="gx-turn gx-turn-assistant gx-thinking" role="status" aria-live="polite">
      <div className="gx-turn-head">
        <AuthorAvatar agent={agent} />
        <span className="gx-turn-name">{agent?.name ?? "Grupo Jadson"}</span>
      </div>
      <div className="gx-thinking-line">
        <span className="gx-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>Pensando…</span>
      </div>
    </div>
  );
}

/** Avatar do autor da resposta: a foto ou inicial do agente; sem agente, o logo do Grupo Jadson. */
function AuthorAvatar({ agent }: { agent?: Agent | undefined }) {
  if (agent) return <AgentAvatar agent={agent} size="sm" />;
  return <span className="gx-avatar gx-avatar-sm gx-avatar-logo"><img src={logo} alt="" /></span>;
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
