import { useCallback, useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import logo from "./assets/grupo-jadson-logo.png";
import { createLocalApiToken, isPostgresUrl, type FirstRunHealth } from "./lib/first-run";

type Props = { apiUrl: string; onComplete: () => void };

export function Welcome({ apiUrl, onComplete }: Props) {
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [health, setHealth] = useState<FirstRunHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
      if (!response.ok) throw new Error("backend");
      const body = await response.json();
      setHealth({
        postgres: body.dependencies?.postgres === "connected" ? "connected" : "unavailable",
        pgvector: body.dependencies?.pgvector === "connected" ? "connected" : "unavailable",
        redis: body.dependencies?.redis === "connected" ? "connected" : "unavailable",
        queue: body.dependencies?.queue ?? { driver: "memory", persistence: "process-memory" },
      });
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, [apiUrl]);

  useEffect(() => { void check(); }, [check]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!isPostgresUrl(databaseUrl)) {
      setError("Informe uma URL PostgreSQL válida, incluindo servidor e banco de dados.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await invoke("save_first_run_config", { databaseUrl: databaseUrl.trim(), apiToken: createLocalApiToken() });
      setSaved(true);
      setDatabaseUrl("");
    } catch {
      setError("Não foi possível salvar a configuração local. Abra o aplicativo desktop do Grupo Jadson e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const databaseReady = health?.postgres === "connected";
  const redisRequired = health?.queue?.driver === "redis";
  const canContinue = databaseReady && (!redisRequired || health?.redis === "connected");

  return (
    <main className="login-screen">
      <section className="login-card welcome-card" aria-labelledby="welcome-title">
        <img src={logo} alt="" className="login-logo" />
        <h1 id="welcome-title">Vamos preparar o Grupo Jadson</h1>
        <p>Este assistente verifica os serviços locais e salva a configuração mínima neste computador.</p>

        <div className="welcome-checklist" aria-live="polite">
          <div className="welcome-check-row">
            <span className={databaseReady ? "welcome-state ready" : "welcome-state"}>{databaseReady ? <Check size={15} /> : <CircleAlert size={15} />}</span>
            <span><strong>Backend e PostgreSQL</strong><small>{health ? (databaseReady ? "Conectado" : "Backend ativo, PostgreSQL indisponível") : "Backend indisponível"}</small></span>
          </div>
          <div className="welcome-check-row">
            <span className={health?.pgvector === "connected" ? "welcome-state ready" : "welcome-state optional"}>{health?.pgvector === "connected" ? <Check size={15} /> : <CircleAlert size={15} />}</span>
            <span><strong>Extensão pgvector</strong><small>{health?.pgvector === "connected" ? "Disponível" : "Não detectada; recursos de memória vetorial podem ficar indisponíveis"}</small></span>
          </div>
          <div className="welcome-check-row">
            <span className={health?.redis === "connected" ? "welcome-state ready" : "welcome-state optional"}>{health?.redis === "connected" ? <Check size={15} /> : <CircleAlert size={15} />}</span>
            <span><strong>Redis</strong><small>{health?.redis === "connected" ? "Conectado" : redisRequired ? "Necessário para a fila configurada" : "Opcional; a fila local em memória é usada"}</small></span>
          </div>
        </div>

        {!databaseReady && <form className="welcome-setup-form" onSubmit={(event) => void save(event)}>
          <label htmlFor="welcome-database-url">Endereço PostgreSQL</label>
          <input id="welcome-database-url" type="password" autoComplete="off" spellCheck={false} placeholder="postgres://grupo_jadson:change_me@localhost:5432/grupo_jadson" value={databaseUrl} onChange={(event) => setDatabaseUrl(event.target.value)} />
          <small>A senha fica no arquivo local de configuração do aplicativo e não é exibida novamente.</small>
          <small>Para iniciar o PostgreSQL de desenvolvimento do projeto, execute <code>docker compose up -d postgres</code> na pasta do projeto.</small>
          <button className="btn-primary-gold" type="submit" disabled={saving || !databaseUrl.trim()}>{saving ? "Salvando…" : "Salvar configuração local"}</button>
        </form>}

        {saved && <div className="welcome-restart" role="status">
          <strong>Configuração salva.</strong>
          <span>O backend precisa ser reiniciado para carregá-la. Na pasta do projeto, execute <code>pnpm dev:backend</code> e depois verifique a conexão novamente.</span>
        </div>}

        {!health && !saved && <div className="welcome-restart">
          <strong>Backend local não encontrado.</strong>
          <span>Inicie o backend com <code>pnpm dev:backend</code>. Para iniciar o banco incluído no ambiente de desenvolvimento, use <code>docker compose up -d postgres</code> na pasta do projeto.</span>
        </div>}

        {error && <div className="gallery-notice-pill" role="alert">{error}</div>}
        <div className="welcome-actions">
          <button type="button" className="welcome-secondary" onClick={() => void check()} disabled={checking || saving}>{checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Verificar conexão</button>
          {canContinue && <button type="button" className="btn-primary-gold" onClick={onComplete}>Continuar</button>}
        </div>
        <p className="welcome-redis-note">Redis não é exigido para o uso padrão. Ele só bloqueia a inicialização quando a fila está configurada explicitamente para usar Redis.</p>
      </section>
    </main>
  );
}
