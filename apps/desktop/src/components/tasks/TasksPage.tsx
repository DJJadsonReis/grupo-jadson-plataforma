import { useCallback, useEffect, useState, type FormEvent } from "react";
import { buildCreateBody, buildPatch, readErrorMessage, statusLabel, TASK_STATUSES, validateDescription, validateTitle, type EditedTask, type TaskRecord, type TaskStatus } from "../../lib/tasks";
import { acoesDaTarefa, botsDisponiveis, resumoResultado } from "../../lib/task-queue";

type TasksPageProps = {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
};

export function TasksPage({ apiFetch, apiUrl }: TasksPageProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edited, setEdited] = useState<EditedTask | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({});
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiFetch(`${apiUrl}/tasks`);
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(readErrorMessage(body, "Não foi possível carregar as tarefas."));
      }
      setTasks(await response.json() as TaskRecord[]);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Não foi possível carregar as tarefas.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, apiUrl]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch(`${apiUrl}/agents`, { signal: controller.signal }).then(async (response) => {
      if (response.ok) setAgents(await response.json() as { id: string; name: string; enabled: boolean }[]);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [apiFetch, apiUrl]);

  useEffect(() => {
    if (!tasks.some((task) => task.status === "na_fila" || task.status === "em_andamento")) return;
    const timer = window.setInterval(() => void loadTasks(), 10_000);
    return () => window.clearInterval(timer);
  }, [tasks, loadTasks]);

  async function queueAction(task: TaskRecord, action: "queue" | "cancel" | "retry") {
    setBusyTaskId(task.id); setActionError(null);
    try {
      const url = `${apiUrl}/tasks/${encodeURIComponent(task.id)}/${action}`;
      const response = await apiFetch(url, { method: "POST", ...(action === "queue" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: selectedAgents[task.id] }) } : {}) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível atualizar a fila da tarefa."));
      await loadTasks();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Não foi possível atualizar a fila da tarefa."); }
    finally { setBusyTaskId(null); }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setActionError(null);
    const titleError = validateTitle(title);
    const descriptionError = validateDescription(description);
    if (titleError || descriptionError) {
      setFormError(titleError ?? descriptionError);
      return;
    }
    setCreating(true);
    try {
      const response = await apiFetch(`${apiUrl}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateBody(title, description)),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível criar a tarefa."));
      setTasks((current) => [body as TaskRecord, ...current]);
      setTitle("");
      setDescription("");
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível criar a tarefa.");
    } finally {
      setCreating(false);
    }
  }

  function startEditing(task: TaskRecord) {
    setEditingId(task.id);
    setEdited({ title: task.title, description: task.description, status: task.status });
    setActionError(null);
  }

  async function saveEdit(task: TaskRecord) {
    if (!edited) return;
    const titleError = validateTitle(edited.title);
    const descriptionError = validateDescription(edited.description);
    if (titleError || descriptionError) {
      setActionError(titleError ?? descriptionError);
      return;
    }
    const patch = buildPatch(task, edited);
    if (!patch) {
      setEditingId(null);
      setEdited(null);
      return;
    }
    setSavingId(task.id);
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = readErrorMessage(body, "Não foi possível atualizar a tarefa.");
        if (response.status === 404 && typeof body === "object" && body !== null && "code" in body && body.code === "TASK_NOT_FOUND") {
          setActionError(message);
          await loadTasks();
          return;
        }
        throw new Error(message);
      }
      const updated = body as TaskRecord;
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setEditingId(null);
      setEdited(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível atualizar a tarefa.");
    } finally {
      setSavingId(null);
    }
  }

  async function archive(task: TaskRecord) {
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "arquivada" }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = readErrorMessage(body, "Não foi possível arquivar a tarefa.");
        if (response.status === 404 && typeof body === "object" && body !== null && "code" in body && body.code === "TASK_NOT_FOUND") {
          setActionError(message);
          await loadTasks();
          return;
        }
        throw new Error(message);
      }
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível arquivar a tarefa.");
    }
  }

  return (
    <section className="page-content" aria-labelledby="tasks-heading">
      <h1 id="tasks-heading">Tarefas</h1>
      <form onSubmit={(event) => void submitCreate(event)}>
        <h2>Nova tarefa</h2>
        <label htmlFor="new-task-title">Título</label>
        <input id="new-task-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required />
        <label htmlFor="new-task-description">Descrição</label>
        <textarea id="new-task-description" value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={creating}>{creating ? "Criando..." : "Criar tarefa"}</button>
      </form>

      {actionError && <p role="alert">{actionError}</p>}
      {loading ? <p>Carregando tarefas…</p> : loadError ? (
        <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadTasks()}>Tentar de novo</button></div>
      ) : tasks.length === 0 ? <p>Ainda não há tarefas.</p> : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              {editingId === task.id && edited ? (
                <div>
                  <label htmlFor={`task-title-${task.id}`}>Título</label>
                  <input id={`task-title-${task.id}`} value={edited.title} maxLength={120} onChange={(event) => setEdited({ ...edited, title: event.target.value })} />
                  <label htmlFor={`task-description-${task.id}`}>Descrição</label>
                  <textarea id={`task-description-${task.id}`} value={edited.description} maxLength={2000} onChange={(event) => setEdited({ ...edited, description: event.target.value })} />
                  <label htmlFor={`task-status-${task.id}`}>Status</label>
                  <select id={`task-status-${task.id}`} value={edited.status} onChange={(event) => setEdited({ ...edited, status: event.target.value as TaskStatus })}>
                    {TASK_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                  </select>
                  <button type="button" disabled={savingId === task.id} onClick={() => void saveEdit(task)}>Salvar</button>
                  <button type="button" onClick={() => { setEditingId(null); setEdited(null); }}>Cancelar</button>
                </div>
              ) : (
                <div>
                  <h2>{task.title}</h2>
                  <p>{task.description}</p>
                  <p><span className="task-status-badge">{statusLabel(task.status)}</span></p>
                  {task.status === "falhou" && task.failureMessage && <p role="alert">{task.failureMessage}</p>}
                  {task.status === "concluida" && task.result && <details><summary>Resultado: {resumoResultado(task.result)}</summary><pre>{task.result}</pre></details>}
                  {acoesDaTarefa(task.status).includes("enviar") && <div>
                    <label htmlFor={`task-agent-${task.id}`}>Enviar para o bot</label>
                    <select id={`task-agent-${task.id}`} value={selectedAgents[task.id] ?? ""} onChange={(event) => setSelectedAgents((current) => ({ ...current, [task.id]: event.target.value }))}>
                      <option value="">Selecione um bot</option>{botsDisponiveis(agents).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                    <button type="button" disabled={!selectedAgents[task.id] || busyTaskId === task.id} onClick={() => void queueAction(task, "queue")}>Enviar para a fila</button>
                  </div>}
                  {acoesDaTarefa(task.status).includes("cancelar") && <button type="button" disabled={busyTaskId === task.id} onClick={() => void queueAction(task, "cancel")}>Cancelar envio</button>}
                  {acoesDaTarefa(task.status).includes("tentar_de_novo") && <button type="button" disabled={busyTaskId === task.id} onClick={() => void queueAction(task, "retry")}>Tentar de novo</button>}
                  {task.status !== "na_fila" && task.status !== "em_andamento" && <button type="button" onClick={() => startEditing(task)}>Editar</button>}
                  {task.status !== "na_fila" && task.status !== "em_andamento" && <button type="button" onClick={() => void archive(task)}>Arquivar</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
