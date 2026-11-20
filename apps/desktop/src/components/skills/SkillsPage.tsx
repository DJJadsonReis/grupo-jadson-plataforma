import { useCallback, useEffect, useState, type FormEvent } from "react";
import { agentSkillUrl, agentSkillsUrl, buildCreateBody, canCreateGlobal, canDeleteSkill, readErrorMessage, toggleTool, validateInstructions, validateSlug, validateTitle, type AgentInfo, type SkillRecord, type ToolInfo } from "../../lib/skills";

type SkillsPageProps = {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
  agents: AgentInfo[];
  isAdmin: boolean;
};

export function SkillsPage({ apiFetch, apiUrl, agents, isAdmin }: SkillsPageProps) {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [createGlobal, setCreateGlobal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentSkills, setAgentSkills] = useState<SkillRecord[]>([]);
  const [attachSlug, setAttachSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [instructions, setInstructions] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<SkillRecord | null>(null);
  const [detachCandidate, setDetachCandidate] = useState<SkillRecord | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiFetch(`${apiUrl}/skills`);
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(readErrorMessage(body, "Não foi possível carregar as habilidades."));
      }
      setSkills(await response.json() as SkillRecord[]);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Não foi possível carregar as habilidades.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, apiUrl]);

  const loadAgentSkills = useCallback(async (agentId: string) => {
    if (!agentId) { setAgentSkills([]); return; }
    try {
      const response = await apiFetch(agentSkillsUrl(apiUrl, agentId));
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível carregar os vínculos do bot."));
      setAgentSkills(body as SkillRecord[]);
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível carregar os vínculos do bot.");
    }
  }, [apiFetch, apiUrl]);

  useEffect(() => { void loadSkills(); }, [loadSkills]);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${apiUrl}/tools`, { signal: controller.signal }).then(async (response) => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível carregar as ferramentas."));
      setTools(body as ToolInfo[]);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setFormError(reason instanceof Error ? reason.message : "Não foi possível carregar as ferramentas.");
    });
    return () => controller.abort();
  }, [apiFetch, apiUrl]);
  useEffect(() => { void loadAgentSkills(selectedAgentId); }, [loadAgentSkills, selectedAgentId]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setActionError(null);
    const error = validateSlug(slug) ?? validateTitle(title) ?? validateInstructions(instructions);
    if (error) { setFormError(error); return; }
    if (summary.length > 300) { setFormError("Resumo inválido."); return; }
    setCreating(true);
    try {
      const response = await apiFetch(`${apiUrl}/skills`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateBody(slug, title, summary, instructions, selectedTools, isAdmin, createGlobal)),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível criar a habilidade."));
      setSlug(""); setTitle(""); setSummary(""); setInstructions(""); setSelectedTools([]); setCreateGlobal(false);
      await loadSkills();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível criar a habilidade.");
    } finally {
      setCreating(false);
    }
  }

  async function removeSkill(skill: SkillRecord) {
    if (!canDeleteSkill(skill, isAdmin)) return;
    setDeletingSlug(skill.slug);
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/skills/${encodeURIComponent(skill.slug)}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível excluir a habilidade."));
      setDeleteCandidate(null); await loadSkills();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível excluir a habilidade.");
    } finally {
      setDeletingSlug(null);
    }
  }

  async function attachSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgentId || !attachSlug) return;
    setActionError(null);
    try {
      const response = await apiFetch(agentSkillsUrl(apiUrl, selectedAgentId), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: attachSlug }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível vincular a habilidade."));
      setAttachSlug("");
      await loadAgentSkills(selectedAgentId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível vincular a habilidade.");
    }
  }

  async function detachSkill(skill: SkillRecord) {
    if (!selectedAgentId) return;
    setActionError(null);
    try {
      const response = await apiFetch(agentSkillUrl(apiUrl, selectedAgentId, skill.slug), { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível desvincular a habilidade."));
      setDetachCandidate(null); await loadAgentSkills(selectedAgentId);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível desvincular a habilidade.");
    }
  }

  const availableSkills = skills.filter((skill) => !agentSkills.some((linked) => linked.slug === skill.slug));

  return (
    <section className="page-content" aria-labelledby="skills-heading">
      <h1 id="skills-heading">Habilidades</h1>
      <form onSubmit={(event) => void submitCreate(event)}>
        <h2>Nova habilidade</h2>
        <label htmlFor="new-skill-slug">Slug</label>
        <input id="new-skill-slug" value={slug} maxLength={40} onChange={(event) => setSlug(event.target.value)} required />
        <label htmlFor="new-skill-title">Título</label>
        <input id="new-skill-title" value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} required />
        <label htmlFor="new-skill-summary">Resumo</label>
        <input id="new-skill-summary" value={summary} maxLength={300} onChange={(event) => setSummary(event.target.value)} />
        <label htmlFor="new-skill-instructions">Instruções</label>
        <textarea id="new-skill-instructions" value={instructions} maxLength={20_000} onChange={(event) => setInstructions(event.target.value)} required />
        <fieldset><legend>Ferramentas concedidas</legend>
          {tools.map((tool) => <label key={tool.name}><input type="checkbox" checked={selectedTools.includes(tool.name)} onChange={(event) => setSelectedTools((current) => toggleTool(current, tool.name, event.target.checked))} /> {tool.name} — {tool.description}</label>)}
          {tools.length === 0 && <p>Nenhuma ferramenta disponível.</p>}
        </fieldset>
        {canCreateGlobal(isAdmin) && <label><input type="checkbox" checked={createGlobal} onChange={(event) => setCreateGlobal(event.target.checked)} /> Criar como global</label>}
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={creating}>{creating ? "Criando..." : "Criar habilidade"}</button>
      </form>

      <section aria-labelledby="agent-skills-heading">
        <h2 id="agent-skills-heading">Habilidades por bot</h2>
        <label htmlFor="skills-agent">Bot</label>
        <select id="skills-agent" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
          <option value="">Selecione um bot</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        {selectedAgentId && <>
          <form onSubmit={(event) => void attachSkill(event)}>
            <label htmlFor="attach-skill">Vincular habilidade</label>
            <select id="attach-skill" value={attachSlug} onChange={(event) => setAttachSlug(event.target.value)} required>
              <option value="">Selecione uma habilidade</option>
              {availableSkills.map((skill) => <option key={skill.id} value={skill.slug}>{skill.title}</option>)}
            </select>
            <button type="submit" disabled={!attachSlug}>Vincular</button>
          </form>
          <ul>{agentSkills.map((skill) => <li key={skill.id}>
            <strong>{skill.title}</strong>{skill.global && <span> Global</span>}
            {skill.tools.length > 0 && <p>Ferramentas: {skill.tools.join(", ")}</p>}
          <button type="button" className="danger-button" onClick={() => setDetachCandidate(skill)}>Desvincular</button>
          </li>)}</ul>
          {agentSkills.length === 0 && <p>Nenhuma habilidade vinculada a este bot.</p>}
        </>}
      </section>

      {actionError && <p role="alert">{actionError}</p>}
      {loading ? <p>Carregando habilidades…</p> : loadError ? (
        <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadSkills()}>Tentar de novo</button></div>
      ) : skills.length === 0 ? <p>Nenhuma habilidade ainda.</p> : (
        <ul>{skills.map((skill) => <li key={skill.id}>
          <h2>{skill.title} {skill.global && <span>Global</span>}</h2>
          {skill.summary && <p>{skill.summary}</p>}
          <p>{skill.instructions}</p>
          {skill.tools.length > 0 && <p>Ferramentas: {skill.tools.join(", ")}</p>}
          <button type="button" className="danger-button" disabled={!canDeleteSkill(skill, isAdmin) || deletingSlug === skill.slug} onClick={() => setDeleteCandidate(skill)}>
            {deletingSlug === skill.slug ? "Excluindo..." : "Excluir"}
          </button>
        </li>)}</ul>
      )}
      {deleteCandidate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteCandidate(null); }}><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="skill-delete-title"><h2 id="skill-delete-title">Excluir habilidade?</h2><p>A habilidade “{deleteCandidate.title}” será excluída.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteCandidate(null)}>Cancelar</button><button type="button" className="danger-button" disabled={deletingSlug === deleteCandidate.slug} onClick={() => void removeSkill(deleteCandidate)}>Excluir</button></div></section></div>}
      {detachCandidate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetachCandidate(null); }}><section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="skill-detach-title"><h2 id="skill-detach-title">Desvincular habilidade?</h2><p>“{detachCandidate.title}” deixará de estar vinculada a este agente.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDetachCandidate(null)}>Cancelar</button><button type="button" className="danger-button" onClick={() => void detachSkill(detachCandidate)}>Desvincular</button></div></section></div>}
    </section>
  );
}
