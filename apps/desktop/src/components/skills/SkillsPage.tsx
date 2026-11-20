import { useCallback, useEffect, useState, type FormEvent } from "react";
import { buildCreateBody, readErrorMessage, validateInstructions, validateSlug, validateTitle, type SkillRecord } from "../../lib/skills";

type SkillsPageProps = {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
};

export function SkillsPage({ apiFetch, apiUrl }: SkillsPageProps) {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
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

  useEffect(() => { void loadSkills(); }, [loadSkills]);

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
        body: JSON.stringify(buildCreateBody(slug, title, summary, instructions)),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível criar a habilidade."));
      setSlug(""); setTitle(""); setSummary(""); setInstructions("");
      await loadSkills();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível criar a habilidade.");
    } finally {
      setCreating(false);
    }
  }

  async function removeSkill(skill: SkillRecord) {
    if (skill.global || !window.confirm(`Excluir a habilidade “${skill.title}”?`)) return;
    setDeletingSlug(skill.slug);
    setActionError(null);
    try {
      const response = await apiFetch(`${apiUrl}/skills/${encodeURIComponent(skill.slug)}`, { method: "DELETE" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readErrorMessage(body, "Não foi possível excluir a habilidade."));
      await loadSkills();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Não foi possível excluir a habilidade.");
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <section className="page-content" aria-labelledby="skills-heading">
      <h1 id="skills-heading">Habilidades</h1>
      <form onSubmit={(event) => void submitCreate(event)}>
        <h2>Nova habilidade pessoal</h2>
        <label htmlFor="new-skill-slug">Slug</label>
        <input id="new-skill-slug" value={slug} maxLength={40} onChange={(event) => setSlug(event.target.value)} required />
        <label htmlFor="new-skill-title">Título</label>
        <input id="new-skill-title" value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} required />
        <label htmlFor="new-skill-summary">Resumo</label>
        <input id="new-skill-summary" value={summary} maxLength={300} onChange={(event) => setSummary(event.target.value)} />
        <label htmlFor="new-skill-instructions">Instruções</label>
        <textarea id="new-skill-instructions" value={instructions} maxLength={20_000} onChange={(event) => setInstructions(event.target.value)} required />
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={creating}>{creating ? "Criando..." : "Criar habilidade"}</button>
      </form>

      {actionError && <p role="alert">{actionError}</p>}
      {loading ? <p>Carregando habilidades...</p> : loadError ? (
        <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void loadSkills()}>Tentar de novo</button></div>
      ) : skills.length === 0 ? <p>Nenhuma habilidade ainda.</p> : (
        <ul>
          {skills.map((skill) => (
            <li key={skill.id}>
              <h2>{skill.title} {skill.global && <span>Global</span>}</h2>
              {skill.summary && <p>{skill.summary}</p>}
              <p>{skill.instructions}</p>
              <button type="button" disabled={skill.global || deletingSlug === skill.slug} onClick={() => void removeSkill(skill)}>
                {deletingSlug === skill.slug ? "Excluindo..." : "Excluir"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
