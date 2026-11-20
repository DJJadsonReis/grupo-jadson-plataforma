import { useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, loadPreferences, MAX_PREFERENCE_INSTRUCTIONS, savePreferences, type ResponseStyle, type UserPreferences } from "../../lib/preferences";

type PreferencesPanelProps = {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
};

export function PreferencesPanel({ apiFetch, apiUrl }: PreferencesPanelProps) {
  const [saved, setSaved] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [instructions, setInstructions] = useState("");
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>("balanced");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadPreferences(apiFetch, apiUrl, controller.signal)
      .then((preferences) => {
        if (controller.signal.aborted) return;
        setSaved(preferences);
        setInstructions(preferences.instructions);
        setResponseStyle(preferences.responseStyle);
        setError(null);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as preferências."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiFetch, apiUrl]);

  const changed = instructions !== saved.instructions || responseStyle !== saved.responseStyle;
  const valid = instructions.length <= MAX_PREFERENCE_INSTRUCTIONS;

  async function save() {
    if (!changed || !valid || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const preferences = await savePreferences(apiFetch, apiUrl, instructions, responseStyle);
      setSaved(preferences);
      setInstructions(preferences.instructions);
      setResponseStyle(preferences.responseStyle);
      setNotice("Preferências salvas.");
    } catch {
      setError("Não foi possível salvar as preferências. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-box" aria-labelledby="preferences-heading">
      <h3 id="preferences-heading">Preferências</h3>
      {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
      {notice && <div role="status">{notice}</div>}
      <label className="workspace-fact" htmlFor="user-instructions"><span>Instruções</span>
        <textarea
          id="user-instructions"
          value={instructions}
          onChange={(event) => { setInstructions(event.target.value); setNotice(null); }}
          disabled={loading}
          maxLength={MAX_PREFERENCE_INSTRUCTIONS + 1}
          rows={4}
          aria-describedby="instructions-count"
          style={{ width: "100%", color: "inherit", font: "inherit" }}
        />
      </label>
      <div id="instructions-count" aria-live="polite">{instructions.length}/{MAX_PREFERENCE_INSTRUCTIONS}</div>
      {!valid && <div role="alert">Instruções devem ter até 3000 caracteres.</div>}
      <label className="workspace-fact" htmlFor="response-style"><span>Estilo de resposta</span>
        <select id="response-style" value={responseStyle} disabled={loading} onChange={(event) => { setResponseStyle(event.target.value as ResponseStyle); setNotice(null); }}>
          <option value="concise">Conciso</option>
          <option value="balanced">Equilibrado</option>
          <option value="detailed">Detalhado</option>
        </select>
      </label>
      <button type="button" className="primary-button" onClick={() => void save()} disabled={loading || !changed || !valid || saving}>
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </section>
  );
}
