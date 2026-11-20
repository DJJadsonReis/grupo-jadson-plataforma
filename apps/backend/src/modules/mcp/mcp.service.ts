import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { maskSecrets, maskSecretValues } from "../../common/secret-masking";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

/** Prefixo historico das ferramentas do servidor de arquivos MCP. */
export const MCP_PREFIX = "arquivos.";

export interface McpToolInfo {
  /** Nome exposto ao sistema, com prefixo. */
  name: string;
  /** Nome original no servidor. */
  remoteName: string;
  description: string;
  /** "read" quando o servidor marca a ferramenta como somente leitura; caso contrario "sensitive". */
  risk: "read" | "sensitive";
}

interface McpServerEntry {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ConnectedServer {
  id: string;
  client: Client;
  tools: McpToolInfo[];
}

interface StoredServer {
  id: string; name: string; command: string; args: string[]; enabled: boolean;
  env_secret: string; status?: "connected" | "error"; status_message?: string;
}

export interface ManagedInput { name: string; command: string; args: string[]; enabled: boolean; env?: Record<string, string> }
export interface ManagedServer { id: string; name: string; command: string; args: string[]; enabled: boolean; status: "connected" | "error"; message: string; toolCount: number; hasEnv: boolean }

function invalid(message: string): never { throw new BadRequestException({ code: "MCP_SERVER_INVALID", message }); }

export function validateManagedInput(input: ManagedInput): void {
  if (!input || !SERVER_ID.test(input.name) || input.name === "arquivos") invalid("O nome deve usar letras minúsculas, números, hífen ou sublinhado e não pode ser arquivos.");
  const commandBase = typeof input.command === "string" ? basename(input.command).replace(/\.exe$/i, "").toLowerCase() : "";
  if (typeof input.command !== "string" || !input.command || (!isAbsolute(input.command) && !/^[A-Za-z0-9._-]+$/.test(input.command)) || /^(sh|bash|dash|zsh|ksh|csh|fish|cmd|powershell|pwsh|wscript|cscript)$/.test(commandBase)) invalid("Informe um caminho absoluto existente ou um nome simples de comando permitido.");
  if (isAbsolute(input.command) && (!existsSync(input.command) || !statSync(input.command).isFile())) invalid("O caminho do comando não é um arquivo existente.");
  if (!Array.isArray(input.args) || input.args.length > 20 || input.args.some((arg) => typeof arg !== "string" || arg.length > 200)) invalid("Informe até 20 argumentos com no máximo 200 caracteres cada.");
  if (typeof input.enabled !== "boolean") invalid("O campo ligado precisa ser verdadeiro ou falso.");
  if (input.env !== undefined && (!input.env || typeof input.env !== "object" || Array.isArray(input.env) || Object.keys(input.env).length > 20 || Object.entries(input.env).some(([key,value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.length > 2000))) invalid("Informe até 20 variáveis de ambiente válidas.");
}

function redactExactSecrets(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  if (Array.isArray(value)) return value.map((item) => redactExactSecrets(item, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactExactSecrets(item, secrets)]));
  return value;
}

const SERVER_ID = /^[a-z][a-z0-9_-]{0,31}$/;

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly servers = new Map<string, ConnectedServer>();
  private tools: McpToolInfo[] = [];
  private readonly box = new SecretBox();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.MCP_FILESYSTEM_DISABLED !== "true") await this.connectFilesystem();
    await this.connectConfiguredServers();
    await this.connectStoredServers();
  }

  private async connectStoredServers(): Promise<void> {
    if (!this.database?.isReady()) return;
    const result = await this.database.getPool().query("SELECT id,name,command,args,env_secret,enabled FROM mcp_servers WHERE enabled=true");
    for (const row of result.rows as StoredServer[]) {
      try {
        const env = row.env_secret ? JSON.parse(this.box.decrypt(row.env_secret)) as Record<string, string> : undefined;
        await this.connectServer(row.name, row.command, row.args, env);
        await this.database.getPool().query("UPDATE mcp_servers SET status='connected',status_message='',updated_at=now() WHERE id=$1", [row.id]);
      } catch (error) {
        const message = "Não foi possível iniciar ou conectar ao servidor MCP.";
        await this.database.getPool().query("UPDATE mcp_servers SET status='error',status_message=$2,updated_at=now() WHERE id=$1", [row.id, message.slice(0, 200)]);
        this.logger.warn(`Servidor MCP '${row.name}' nao conectado: ${message}`);
      }
    }
  }

  async listManaged(): Promise<ManagedServer[]> {
    const rows = this.database?.isReady() ? (await this.database.getPool().query("SELECT id,name,command,args,enabled,status,status_message,env_secret FROM mcp_servers ORDER BY name")).rows as StoredServer[] : [];
    return rows.map((row) => ({ id: row.id, name: row.name, command: row.command, args: row.args, enabled: row.enabled, status: row.status ?? "error", message: row.status_message ?? "", toolCount: this.servers.get(row.name)?.tools.length ?? 0, hasEnv: Boolean(row.env_secret) }));
  }

  async saveManaged(id: string | null, input: ManagedInput): Promise<ManagedServer> {
    if (!this.database?.isReady()) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "O banco de dados precisa estar disponível para gerenciar servidores MCP." });
    const pool = this.database.getPool();
    const existing = id ? await pool.query("SELECT id,name,command,args,enabled,env_secret FROM mcp_servers WHERE id=$1", [id]) : { rows: [] };
    if (id && !existing.rows[0]) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "Servidor MCP não encontrado." });
    const old = existing.rows[0] as (StoredServer & { env_secret: string }) | undefined;
    const merged = old ? { name: input.name ?? old.name, command: input.command ?? old.command, args: input.args ?? old.args, enabled: input.enabled ?? old.enabled, ...(input.env === undefined ? {} : { env: input.env }) } : input;
    validateManagedInput(merged as ManagedInput);
    if (merged.enabled && !old?.enabled) {
      const enabled = await pool.query("SELECT count(*)::int AS count FROM mcp_servers WHERE enabled=true AND id<>$1", [id ?? ""]);
      if (Number(enabled.rows[0]?.count ?? 0) >= 10) invalid("O limite é de 10 servidores MCP ligados.");
    }
    if (merged.env && Object.keys(merged.env).length && !process.env.CREDENTIAL_KEY?.trim()) invalid("Configure CREDENTIAL_KEY antes de salvar variáveis secretas; o arquivo .env não será alterado.");
    const envSecret = merged.env === undefined ? old?.env_secret ?? "" : Object.keys(merged.env).length ? this.box.encrypt(JSON.stringify(merged.env)) : "";
    const serverId = id ?? randomUUID();
    if (id) await pool.query("UPDATE mcp_servers SET name=$2,command=$3,args=$4::jsonb,env_secret=$5,enabled=$6,updated_at=now() WHERE id=$1", [id, merged.name, merged.command, JSON.stringify(merged.args), envSecret, merged.enabled]);
    else await pool.query("INSERT INTO mcp_servers(id,name,command,args,env_secret,enabled) VALUES($1,$2,$3,$4::jsonb,$5,$6)", [serverId, merged.name, merged.command, JSON.stringify(merged.args), envSecret, merged.enabled]);
    if (old) await this.disconnectServer(old.name);
    let status: "connected" | "error" = "error";
    let message = "Desligado.";
    if (merged.enabled) {
      try {
        const env = envSecret ? JSON.parse(this.box.decrypt(envSecret)) as Record<string, string> : undefined;
        await this.connectServer(merged.name, merged.command, merged.args, env);
        status = "connected"; message = "";
      } catch (error) {
        message = "Não foi possível iniciar ou conectar ao servidor MCP.";
        this.logger.warn(`Servidor MCP '${merged.name}' nao conectado: ${message}`);
      }
      await pool.query("UPDATE mcp_servers SET status=$2,status_message=$3 WHERE id=$1", [serverId, status, message]);
    } else await pool.query("UPDATE mcp_servers SET status='error',status_message=$2 WHERE id=$1", [serverId, message]);
    return (await this.listManaged()).find((server) => server.id === serverId)!;
  }

  async removeManaged(id: string): Promise<void> {
    if (!this.database?.isReady()) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "O banco de dados precisa estar disponível para gerenciar servidores MCP." });
    const found = await this.database.getPool().query("SELECT name FROM mcp_servers WHERE id=$1", [id]);
    if (!found.rows[0]) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "Servidor MCP não encontrado." });
    await this.disconnectServer(String(found.rows[0].name));
    await this.database.getPool().query("DELETE FROM mcp_servers WHERE id=$1", [id]);
  }

  private async disconnectServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;
    this.servers.delete(id);
    this.tools = this.tools.filter((tool) => !server.tools.includes(tool));
    await server.client.close().catch(() => undefined);
  }

  private async connectFilesystem(): Promise<void> {
    const root = resolve(process.env.MCP_FILESYSTEM_ROOT ?? resolve(process.cwd(), "..", "..", "workspace"));
    if (!existsSync(root)) {
      this.logger.warn(`Pasta do servidor de arquivos nao existe: ${root}. Servidor nao iniciado.`);
      return;
    }
    try {
      const entry = createRequire(__filename).resolve("@modelcontextprotocol/server-filesystem/dist/index.js");
      await this.connectServer("arquivos", process.execPath, [entry, root]);
      this.logger.log(`Servidor de arquivos conectado (${this.servers.get("arquivos")?.tools.length ?? 0} ferramentas), limitado a ${root}.`);
    } catch (error) {
      this.logger.warn(`Servidor de arquivos nao conectado: ${this.safeError(error)}`);
    }
  }

  private async connectConfiguredServers(): Promise<void> {
    const raw = process.env.MCP_SERVERS;
    if (raw === undefined || raw.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.logger.warn(`MCP_SERVERS contem JSON invalido: ${this.safeError(error)}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      this.logger.warn("MCP_SERVERS deve ser um array JSON.");
      return;
    }

    const seen = new Set<string>();
    for (const [index, candidate] of parsed.entries()) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        this.logger.warn(`Servidor MCP na posicao ${index} ignorado: entrada invalida.`);
        continue;
      }
      const entry = candidate as Partial<McpServerEntry>;
      if (typeof entry.id !== "string" || typeof entry.command !== "string" || !entry.command.trim()) {
        this.logger.warn(`Servidor MCP na posicao ${index} ignorado: id e command sao obrigatorios.`);
        continue;
      }
      const { id, command } = entry;
      if (!SERVER_ID.test(id) || id === "arquivos" || seen.has(id)) {
        this.logger.warn(`Servidor MCP '${maskSecrets(id)}' na posicao ${index} ignorado: id invalido, reservado ou duplicado.`);
        continue;
      }
      seen.add(id);
      if (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((arg) => typeof arg !== "string"))) {
        this.logger.warn(`Servidor MCP '${maskSecrets(id)}' ignorado: args deve ser um array de strings.`);
        continue;
      }
      if (entry.env !== undefined && (!entry.env || typeof entry.env !== "object" || Array.isArray(entry.env) || Object.values(entry.env).some((value) => typeof value !== "string"))) {
        this.logger.warn(`Servidor MCP '${maskSecrets(id)}' ignorado: env deve conter valores string.`);
        continue;
      }
      try {
        await this.connectServer(id, command, entry.args ?? [], entry.env);
        this.logger.log(`Servidor MCP '${maskSecrets(id)}' conectado (${this.servers.get(id)?.tools.length ?? 0} ferramentas).`);
      } catch (error) {
        this.logger.warn(`Servidor MCP '${maskSecrets(id)}' nao conectado: ${this.safeError(error, Object.values(entry.env ?? {}))}`);
      }
    }
  }

  private async connectServer(id: string, command: string, args: string[], env?: Record<string, string>): Promise<void> {
    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...getDefaultEnvironment(), ...env },
    });
    const client = new Client({ name: "grupo-jadson", version: "0.1.0" });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      const prefix = id === "arquivos" ? MCP_PREFIX : `${id}.`;
      const tools = listed.tools.map((tool) => ({
        name: `${prefix}${tool.name}`,
        remoteName: tool.name,
        description: tool.description ?? (id === "arquivos" ? "Ferramenta do servidor de arquivos." : `Ferramenta do servidor MCP ${id}.`),
        risk: tool.annotations?.readOnlyHint === true ? "read" as const : "sensitive" as const,
      }));
      this.servers.set(id, { id, client, tools });
      this.tools.push(...tools);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  private safeError(error: unknown, extraSecrets: readonly string[] = []): string {
    return maskSecrets(error instanceof Error ? error.message : "erro", extraSecrets);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.servers.values()].map(({ client }) => client.close().catch(() => undefined)));
  }

  async connectionStatus(id: string): Promise<{ status: "connected" | "error"; message: string }> {
    const row = (await this.database?.getPool().query("SELECT status,status_message FROM mcp_servers WHERE id=$1", [id]))?.rows[0] as { status: "connected" | "error"; status_message: string } | undefined;
    return { status: row?.status ?? "error", message: row?.status_message ?? "Servidor indisponível." };
  }

  catalog(): McpToolInfo[] {
    return this.tools;
  }

  find(name: string): McpToolInfo | undefined {
    return this.tools.find((tool) => tool.name === name);
  }

  /** Chama a ferramenta no servidor correspondente e devolve o conteudo textual do resultado. */
  async call(name: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.find(name);
    const separator = name.indexOf(".");
    const id = separator < 0 ? undefined : name.slice(0, separator);
    const server = id ? this.servers.get(id) : undefined;
    if (!tool || !server) throw new Error("Ferramenta de arquivos indisponível.");
    const result = await server.client.callTool({ name: tool.remoteName, arguments: input });
    const saved = id && this.database?.isReady() ? (await this.database.getPool().query("SELECT env_secret FROM mcp_servers WHERE name=$1", [id])).rows[0] as { env_secret: string } | undefined : undefined;
    const secrets = saved?.env_secret ? Object.values(JSON.parse(this.box.decrypt(saved.env_secret)) as Record<string, string>) : [];
    return { conteudo: maskSecretValues(redactExactSecrets(result.content, secrets)), erro: result.isError === true };
  }
}
