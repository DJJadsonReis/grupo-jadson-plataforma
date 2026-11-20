import { useCallback, useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import logo from "./assets/grupo-jadson-logo.png";
import { confirmPostgresInstall, createLocalApiToken, describeLocalServicesCommand, describePostgresInstallCommand, isPostgresUrl, isSha256, shouldAskServicesConsent, summarizeProcessOutput, type FirstRunHealth } from "./lib/first-run";
import { evaluateWindowsBuild, type WindowsBuildEvaluation } from "./lib/windows-requirements";
import { checkFirstRunHealth } from "./lib/first-run-health";

type Props = { apiUrl: string; onComplete: () => void };

export function Welcome({ apiUrl, onComplete }: Props) {
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [health, setHealth] = useState<FirstRunHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servicesInfo, setServicesInfo] = useState<{ scriptPath: string; projectRoot: string; servicesConsent: boolean } | null>(null);
  const [showServicesDialog, setShowServicesDialog] = useState(false);
  const [startingServices, setStartingServices] = useState(false);
  const [servicesOutput, setServicesOutput] = useState<string | null>(null);
  const [postgresInstallInfo, setPostgresInstallInfo] = useState<{ downloadsDir: string; destination: string; destinationEmpty: boolean } | null>(null);
  const [archivePath, setArchivePath] = useState("");
  const [archiveSha256, setArchiveSha256] = useState("");
  const [showPostgresDialog, setShowPostgresDialog] = useState(false);
  const [installingPostgres, setInstallingPostgres] = useState(false);
  const [postgresInstallOutput, setPostgresInstallOutput] = useState<string | null>(null);
  const [windowsRequirement, setWindowsRequirement] = useState<WindowsBuildEvaluation | null>(null);

  useEffect(() => {
    let active = true;
    void invoke<string>("get_windows_build")
      .then((build) => { if (active) setWindowsRequirement(evaluateWindowsBuild(build)); })
      .catch(() => { if (active) setWindowsRequirement(evaluateWindowsBuild(undefined)); });
    return () => { active = false; };
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await checkFirstRunHealth(apiUrl, fetch, async () => {
        return invoke<string>("get_first_run_api_token");
      }, () => invoke("ensure_desktop_setup"));
      setHealth(result);
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, [apiUrl]);

  useEffect(() => { void check(); }, [check]);

  useEffect(() => {
    let active = true;
    void invoke<{ downloadsDir: string; destination: string; destinationEmpty: boolean }>("get_postgres_install_info")
      .then((info) => { if (active) setPostgresInstallInfo(info); })
      .catch(() => { if (active) setPostgresInstallInfo(null); });
    return () => { active = false; };
  }, []);

  async function installPostgres() {
    setShowPostgresDialog(false);
    if (!isSha256(archiveSha256)) { setError("SHA-256 inválido: informe exatamente 64 caracteres hexadecimais."); return; }
    setInstallingPostgres(true);
    setError(null);
    setPostgresInstallOutput(null);
    try {
      const result = await invoke<{ exitCode: number; stdout: string; stderr: string }>("install_postgresql_portable", { archivePath: archivePath.trim(), expectedSha256: archiveSha256.trim() });
      const output = summarizeProcessOutput(result.stdout, result.stderr);
      setPostgresInstallOutput(`Código do instalador: ${result.exitCode}\n${output}`);
      if (result.exitCode !== 0) throw new Error(output || `O instalador terminou com código ${result.exitCode}.`);
      await check();
      const updated = await invoke<{ downloadsDir: string; destination: string; destinationEmpty: boolean }>("get_postgres_install_info");
      setPostgresInstallInfo(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "Falha ao instalar PostgreSQL. Confira o ZIP e o SHA-256 e tente novamente.");
    } finally {
      setInstallingPostgres(false);
    }
  }

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

  async function requestServicesStart() {
    if (windowsRequirement?.status === "bloqueado") return;
    setError(null);
    setServicesOutput(null);
    try {
      const info = await invoke<{ scriptPath: string; projectRoot: string; servicesConsent: boolean }>("get_local_services_info");
      setServicesInfo(info);
      if (shouldAskServicesConsent(info.servicesConsent)) setShowServicesDialog(true);
      else await startServices();
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Scripts de inicialização não encontrados; inicie manualmente.");
    }
  }

  async function startServices() {
    setShowServicesDialog(false);
    setStartingServices(true);
    setError(null);
    try {
      const result = await invoke<{ stdout: string; stderr: string }>("start_local_services");
      setServicesOutput(summarizeProcessOutput(result.stdout, result.stderr));
      await check();
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Não foi possível iniciar os serviços locais. Você pode tentar novamente ou iniciá-los manualmente.");
    } finally {
      setStartingServices(false);
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
        <p>Este assistente verifica os serviços locais e salva a configuração neste computador.</p>

        {windowsRequirement?.status === "bloqueado" && <div className="gallery-notice-pill" role="alert">{windowsRequirement.message}</div>}
        {windowsRequirement?.status === "indisponivel" && <small role="status">{windowsRequirement.message}</small>}

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
          <label htmlFor="welcome-database-url">Endereço do PostgreSQL</label>
          <input id="welcome-database-url" type="password" autoComplete="off" spellCheck={false} placeholder="postgres://grupo_jadson:change_me@localhost:5432/grupo_jadson" value={databaseUrl} onChange={(event) => setDatabaseUrl(event.target.value)} />
          <small>A senha fica salva neste computador e não será exibida novamente.</small>
          <small>Para iniciar o PostgreSQL de desenvolvimento do projeto, execute <code>docker compose up -d postgres</code> na pasta do projeto.</small>
          <button className="btn-primary-gold" type="submit" disabled={saving || !databaseUrl.trim()}>{saving ? "Salvando…" : "Salvar configuração"}</button>
        </form>}

        {!databaseReady && postgresInstallInfo?.destinationEmpty && <section className="welcome-setup-form" aria-label="Instalação portátil do PostgreSQL">
          <strong>Instalar PostgreSQL portátil</strong>
          <small>Coloque o ZIP oficial em <code>{postgresInstallInfo.downloadsDir}</code> e informe o SHA-256 conferido na fonte oficial. O aplicativo não baixa arquivos.</small>
          <label htmlFor="postgres-archive-path">Caminho do ZIP</label>
          <input id="postgres-archive-path" value={archivePath} onChange={(event) => setArchivePath(event.target.value)} placeholder={`${postgresInstallInfo.downloadsDir}\\postgresql.zip`} autoComplete="off" spellCheck={false} />
          <label htmlFor="postgres-archive-sha">SHA-256 do ZIP</label>
          <input id="postgres-archive-sha" value={archiveSha256} onChange={(event) => setArchiveSha256(event.target.value)} autoComplete="off" spellCheck={false} />
          <button type="button" className="btn-primary-gold" onClick={() => { setError(null); setShowPostgresDialog(true); }} disabled={installingPostgres || !archivePath.trim() || !archiveSha256.trim()}>{installingPostgres ? <><LoaderCircle className="spin" size={16} /> Instalando PostgreSQL…</> : "Instalar PostgreSQL"}</button>
        </section>}
        {(databaseReady || postgresInstallInfo?.destinationEmpty === false) && <div className="welcome-restart" role="status"><strong>PostgreSQL já instalado</strong><span>O assistente não oferece substituição da instalação existente.</span></div>}
        {installingPostgres && <div className="welcome-restart" role="status"><LoaderCircle className="spin" size={16} /> Instalando PostgreSQL. Aguarde a validação e extração do ZIP…</div>}
        {postgresInstallOutput && <pre className="welcome-restart" role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{postgresInstallOutput}</pre>}

        {showPostgresDialog && postgresInstallInfo && <div className="modal-backdrop" role="presentation">
          <section className="agent-modal" role="dialog" aria-modal="true" aria-labelledby="postgres-dialog-title">
            <div className="modal-heading"><h2 id="postgres-dialog-title">Confirmar instalação do PostgreSQL?</h2></div>
            <div className="modal-fields"><p>Este comando só será executado depois da confirmação. Nenhum serviço será iniciado.</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{describePostgresInstallCommand("scripts\\install-postgresql-portable.ps1", archivePath.trim(), archiveSha256.trim(), "tools\\postgresql")}</pre></div>
            <div className="modal-footer"><button type="button" className="btn-outline-sm" onClick={() => { setShowPostgresDialog(false); void confirmPostgresInstall(false, installPostgres); }}>Cancelar</button><button type="button" className="btn-primary-gold" onClick={() => void confirmPostgresInstall(true, installPostgres)}>Confirmar e instalar</button></div>
          </section>
        </div>}

        {saved && <div className="welcome-restart" role="status">
          <strong>Configuração salva.</strong>
          <span>O backend precisa ser reiniciado para carregá-la. Na pasta do projeto, execute <code>pnpm dev:backend</code> e depois verifique a conexão novamente.</span>
        </div>}

        {!health && !saved && <div className="welcome-restart">
          <strong>Backend local não encontrado.</strong>
          <span>Inicie o backend com <code>pnpm dev:backend</code>. Para iniciar o banco incluído no ambiente de desenvolvimento, use <code>docker compose up -d postgres</code> na pasta do projeto.</span>
        </div>}

        <div className="welcome-restart">
          <strong>Inicialização local</strong>
          <span>O script pode iniciar PostgreSQL (se disponível), Redis (se disponível), backend e interface Vite. Os logs ficam em <code>.runtime\logs</code> (incluindo PostgreSQL e Redis); os PIDs ficam em <code>.runtime\processes.json</code> e, para PostgreSQL, em <code>.runtime\database\postmaster.pid</code>.</span>
          <button type="button" className="btn-primary-gold" onClick={() => void requestServicesStart()} disabled={startingServices || windowsRequirement?.status === "bloqueado"}>{startingServices ? "Iniciando serviços…" : "Iniciar serviços locais"}</button>
        </div>

        {servicesOutput && <pre className="welcome-restart" role="status" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{servicesOutput}</pre>}

        {showServicesDialog && servicesInfo && <div className="modal-backdrop" role="presentation">
          <section className="agent-modal" role="dialog" aria-modal="true" aria-labelledby="services-dialog-title">
            <div className="modal-heading"><h2 id="services-dialog-title">Iniciar serviços locais?</h2></div>
            <div className="modal-fields">
              <p>O comando será executado somente depois da sua confirmação:</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{describeLocalServicesCommand(servicesInfo.scriptPath, servicesInfo.projectRoot)}</pre>
              <p>O script pode iniciar PostgreSQL (se disponível), Redis (se disponível), backend e interface Vite. Os logs ficam em <code>.runtime\logs</code> (incluindo PostgreSQL e Redis); os PIDs ficam em <code>.runtime\processes.json</code> e, para PostgreSQL, em <code>.runtime\database\postmaster.pid</code>.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-outline-sm" onClick={() => setShowServicesDialog(false)}>Pular (eu inicio manualmente)</button>
              <button type="button" className="btn-primary-gold" onClick={() => void startServices()}>Confirmar e iniciar</button>
            </div>
          </section>
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
