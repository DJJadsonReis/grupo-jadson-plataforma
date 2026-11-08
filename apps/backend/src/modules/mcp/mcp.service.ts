import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/** Prefixo que identifica as ferramentas vindas de servidores MCP. */
export const MCP_PREFIX = "arquivos.";

export interface McpToolInfo {
  /** Nome exposto ao sistema, com prefixo. */
  name: string;
  /** Nome original no servidor. */
  remoteName: string;
  description: string;
  /** "read" quando o servidor marca a ferramenta como somente leitura; caso contrário "sensitive". */
  risk: "read" | "sensitive";
}

/**
 * Cliente de servidores MCP. Hoje conecta só o servidor de arquivos oficial, limitado a uma
 * pasta (workspace). Qualquer ferramenta que não se declare somente leitura é tratada como
 * sensível: exige aprovação antes de rodar.
 */
@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private client: Client | null = null;
  private tools: McpToolInfo[] = [];

  async onModuleInit(): Promise<void> {
    if (process.env.MCP_FILESYSTEM_DISABLED === "true") return;
    const root = resolve(process.env.MCP_FILESYSTEM_ROOT ?? resolve(process.cwd(), "..", "..", "workspace"));
    if (!existsSync(root)) {
      this.logger.warn(`Pasta do servidor de arquivos não existe: ${root}. Servidor não iniciado.`);
      return;
    }
    try {
      const entry = createRequire(__filename).resolve("@modelcontextprotocol/server-filesystem/dist/index.js");
      const transport = new StdioClientTransport({ command: process.execPath, args: [entry, root] });
      const client = new Client({ name: "grupo-jadson", version: "0.1.0" });
      await client.connect(transport);
      const listed = await client.listTools();
      this.client = client;
      this.tools = listed.tools.map((tool) => ({
        name: `${MCP_PREFIX}${tool.name}`,
        remoteName: tool.name,
        description: tool.description ?? "Ferramenta do servidor de arquivos.",
        risk: tool.annotations?.readOnlyHint === true ? "read" : "sensitive",
      }));
      this.logger.log(`Servidor de arquivos conectado (${this.tools.length} ferramentas), limitado a ${root}.`);
    } catch (error) {
      this.logger.warn(`Servidor de arquivos não conectado: ${error instanceof Error ? error.message : "erro"}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close().catch(() => undefined);
  }

  catalog(): McpToolInfo[] {
    return this.tools;
  }

  find(name: string): McpToolInfo | undefined {
    return this.tools.find((tool) => tool.name === name);
  }

  /** Chama a ferramenta no servidor e devolve o conteúdo textual do resultado. */
  async call(name: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.find(name);
    if (!tool || !this.client) throw new Error("Ferramenta de arquivos indisponível.");
    const result = await this.client.callTool({ name: tool.remoteName, arguments: input });
    return { conteudo: result.content, erro: result.isError === true };
  }
}
