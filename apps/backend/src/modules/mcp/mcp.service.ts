import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { maskSecrets } from "../../common/secret-masking";

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

const SERVER_ID = /^[a-z][a-z0-9_-]{0,31}$/;

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly servers = new Map<string, ConnectedServer>();
  private tools: McpToolInfo[] = [];

  async onModuleInit(): Promise<void> {
    if (process.env.MCP_FILESYSTEM_DISABLED !== "true") await this.connectFilesystem();
    await this.connectConfiguredServers();
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
    return { conteudo: result.content, erro: result.isError === true };
  }
}
