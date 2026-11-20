import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AgentPolicyService } from "./agent-policy.service";
import { randomUUID } from "node:crypto";
import { ApprovalsService } from "../audit/approvals.service";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { MemoryService } from "../memory/memory.service";
import { findTool, TOOL_DEFINITIONS, ToolDefinition } from "./tools.registry";
import { McpService } from "../mcp/mcp.service";
import { searchTavily, searchWikipedia } from "./web-search";
import { IntegrationsService } from "../integrations/integrations.service";
import { GoogleService } from "../google/google.service";
import { appendNotionText, createNotionPage, readNotionPage, searchNotion } from "./notion";
import { listFiles, readText, writeText } from "./workspace-files";
import { withUntrustedNotice } from "./untrusted-content";
import { environmentSecrets, maskSecrets, maskSecretValues } from "../../common/secret-masking";
import { NotificationsService } from "../notifications/notifications.service";
import { readPage } from "./page-reader";
import { ConnectionSharesService } from "../connection-shares/connection-shares.service";

/** O id da pessoa vem sempre do servidor (`requesterId`), nunca do corpo da requisição. */
function scopeInput(input: Record<string, unknown>, requesterId?: string): Record<string, unknown> {
  const scoped = { ...input };
  delete scoped.pessoaId;
  if (requesterId) scoped.pessoaId = requesterId;
  return scoped;
}

export interface ToolRun {
  id: string;
  tool: string;
  requestedBy: string;
  status: string;
  input: Record<string, unknown>;
  output: unknown;
  approvalId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const COLUMNS = `id, tool, requested_by AS "requestedBy", status, input, output, approval_id AS "approvalId",
  created_at AS "createdAt", finished_at AS "finishedAt"`;

/** Ferramentas que só devolvem dado local do próprio sistema (hora, memória). Todo o resto é de fora. */
const LOCAL_TOOLS = new Set(["tempo.agora", "memoria.listar", "memoria.apagar_tudo"]);

/** Resultado de ferramenta de fora (web, Notion, Drive, Agenda, arquivo, MCP) é marcado como dado não confiável. */
function isOutsideTool(name: string): boolean {
  return !LOCAL_TOOLS.has(name);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ferramenta que devolve erro (ex.: caminho recusado pelo servidor) não conta como concluída. */
function statusOf(output: unknown): "done" | "failed" {
  return (output as { erro?: unknown } | null)?.erro === true ? "failed" : "done";
}

@Injectable()
export class ToolsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly memory: MemoryService,
    private readonly mcp: McpService,
    private readonly integrations: IntegrationsService,
    private readonly policies: AgentPolicyService,
    private readonly google: GoogleService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly shares?: ConnectionSharesService,
  ) {}

  catalog(): ToolDefinition[] {
    const fromMcp = this.mcp.catalog().map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk }));
    return [...TOOL_DEFINITIONS, ...fromMcp];
  }

  /** Sanitiza texto de saída/erro usando integrações e ambiente, sem guardar os valores. */
  async maskSecretText(value: string): Promise<string> {
    try {
      return maskSecrets(value, [...environmentSecrets(), ...(await this.integrations.secretValuesForMasking())]);
    } catch {
      return maskSecrets(value, environmentSecrets());
    }
  }

  /** Valores secretos conhecidos (ambiente e integrações), em memória, para mascarar um fluxo de texto. */
  async secretsForMasking(): Promise<string[]> {
    try {
      return [...environmentSecrets(), ...(await this.integrations.secretValuesForMasking())];
    } catch {
      return environmentSecrets();
    }
  }

  private async maskSecretOutput(value: unknown): Promise<unknown> {
    try {
      const known = [...environmentSecrets(), ...(await this.integrations.secretValuesForMasking())];
      return maskSecretValues(value, known);
    } catch {
      return maskSecretValues(value, environmentSecrets());
    }
  }

  /** Usa uma ferramenta. Leitura roda na hora; sensível fica pendente até aprovação. */
  async invoke(name: string, rawInput: Record<string, unknown>, requestedBy: string, agentId?: string, requesterId?: string): Promise<ToolRun> {
    const tool = this.catalog().find((item) => item.name === name) ?? findTool(name);
    if (!tool) throw new NotFoundException({ code: "NOT_FOUND", message: "Ferramenta não encontrada." });
    const input = scopeInput(rawInput, requesterId);
    const id = randomUUID();

    // Regra do agente vem antes de tudo: "deny" recusa e fica na auditoria; "allow" dispensa aprovação.
    const policy = agentId ? await this.policies.decisionFor(agentId, tool.name) : null;
    if (policy === "deny") {
      await this.audit.record({ actor: requestedBy, action: "tool.refused", subject: tool.name, details: { agentId, rule: "deny" } });
      throw new ForbiddenException({ code: "POLICY_DENIED", message: "A regra deste agente recusa essa ferramenta." });
    }

    if (tool.risk === "sensitive" && policy !== "allow") {
      const approval = await this.approvals.request({
        action: `tool.${tool.name}`,
        subject: id,
        summary: tool.description,
        payload: input,
        requestedBy,
      });
      const pending = await this.insert(id, tool.name, requestedBy, "pending_approval", input, null, approval.id);
      try {
        await this.notifications?.create({ owner: requesterId ?? requestedBy, kind: "approval.pending", title: "Ação aguardando aprovação", body: tool.description, details: { tool: tool.name, runId: id, approvalId: approval.id } });
      } catch { /* notification failure must not cancel a persisted approval */ }
      return pending;
    }

    const output = await this.safeRun(tool.name, input);
    await this.audit.record({ actor: requestedBy, action: "tool.run", subject: tool.name, details: { risk: tool.risk, ...(policy === "allow" ? { agentId, rule: "allow" } : {}) } });
    return this.insert(id, tool.name, requestedBy, statusOf(output), input, output, null);
  }

  /** Executa uma ação sensível já aprovada. Recusa se a aprovação não existir ou não foi concedida. */
  async executeApproved(runId: string, actor: string): Promise<ToolRun> {
    const run = await this.get(runId);
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Execução não encontrada." });
    if (run.status !== "pending_approval" || !run.approvalId) {
      throw new BadRequestException({ code: "NOT_PENDING", message: "Esta execução não está aguardando aprovação." });
    }
    const approval = await this.approvals.get(run.approvalId);
    if (!approval || approval.status !== "approved") {
      throw new BadRequestException({ code: "NOT_APPROVED", message: "A aprovação ainda não foi concedida." });
    }
    const output = await this.safeRun(run.tool, run.input);
    await this.audit.record({ actor, action: "tool.run", subject: run.tool, details: { approvalId: run.approvalId } });
    await this.database.getPool().query(
      `UPDATE tool_runs SET status = $3, output = $2, finished_at = now() WHERE id = $1`,
      [runId, JSON.stringify(output), statusOf(output)],
    );
    return (await this.get(runId)) as ToolRun;
  }

  async list(limit = 50): Promise<ToolRun[]> {
    const safe = Math.min(Math.max(Math.floor(limit) || 50, 1), 200);
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM tool_runs ORDER BY created_at DESC LIMIT $1`, [safe]);
    return result.rows as ToolRun[];
  }

  async get(id: string): Promise<ToolRun | null> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM tool_runs WHERE id = $1`, [id]);
    return result.rowCount === 0 ? null : (result.rows[0] as ToolRun);
  }

  /** Roda a ferramenta; uma falha vira resultado com erro, gravado no histórico, em vez de derrubar a requisição. */
  private async safeRun(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      const output = await this.maskSecretOutput(await this.runTool(name, input));
      return isOutsideTool(name) && isPlainObject(output) ? withUntrustedNotice(output, name) : output;
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null;
      if (response && typeof response === "object" && "code" in response && (response as { code?: unknown }).code === "CONEXAO_NAO_LIBERADA") {
        return { erro: true, code: "CONEXAO_NAO_LIBERADA", mensagem: "Você não tem acesso a esta conexão." };
      }
      const message = error instanceof Error ? error.message : "Falha ao executar a ferramenta.";
      return { erro: true, mensagem: await this.maskSecretText(message) };
    }
  }

  /** As únicas ações que existem hoje. Nenhuma toca o sistema operacional. */
  private async runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (this.mcp.find(name)) return this.mcp.call(name, input);
    if (name === "tempo.agora") return { agora: new Date().toISOString() };
    if (name === "busca.wikipedia") return { resultados: await searchWikipedia(String(input.consulta ?? input.query ?? "")) };
    if (name === "pagina.ler") return readPage(String(input.url ?? ""));
    if (name === "busca.web") return { resultados: await searchTavily(String(input.consulta ?? input.query ?? ""), await this.integrations.secret("tavily")) };
    if (name === "memoria.listar") return { itens: await this.memory.list(typeof input.pessoaId === "string" ? input.pessoaId : "local") };
    if (name === "memoria.apagar_tudo") {
      const removed = await this.database.getPool().query(`DELETE FROM memories WHERE owner = 'local'`);
      return { apagadas: removed.rowCount ?? 0 };
    }
    if (name === "atendimento.humano") {
      const motivo = String(input.motivo ?? "").trim().slice(0, 1000);
      if (!motivo) return { erro: true, mensagem: "Descreva o motivo do atendimento humano." };
      const requestedBy = typeof input.pessoaId === "string" ? input.pessoaId : "sistema";
      const conversationId = typeof input.conversaId === "string" ? input.conversaId : null;
      await this.audit.record({ actor: requestedBy, action: "human_support.requested", subject: conversationId, details: { motivo } });
      if (this.notifications) {
        const body = (await this.maskSecretText(motivo)).slice(0, 300);
        let adminIds: string[] = [];
        try {
          const admins = await this.database.getPool().query("SELECT id FROM users WHERE role='admin' AND active=true");
          adminIds = admins.rows.map((row: { id: string }) => row.id);
        } catch { /* instalação pessoal sem tabela users */ }
        const recipients = adminIds.length ? adminIds : ["sistema"];
        await Promise.all(recipients.map((owner) => this.notifications!.create({
          owner,
          kind: "human_support.requested",
          title: "Atendimento humano solicitado",
          body,
          details: { conversationId, requestedBy },
        }).catch(() => undefined)));
      }
      return { registrada: true, mensagem: "Pedido de atendimento humano registrado internamente." };
    }
    if (name.startsWith("agenda.") || name.startsWith("drive.")) return this.runGoogle(name, input);
    if (name.startsWith("notion.")) return this.runNotion(name, input);
    if (name.startsWith("computador.")) return this.runComputer(name, input);
    throw new BadRequestException({ code: "NOT_FOUND", message: "Ferramenta sem implementação." });
  }

  /** Computador do Bot: só dentro da pasta de trabalho; a escrita já chega aqui depois da aprovação. */
  private async runComputer(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      if (name === "computador.listar") return { itens: await listFiles(String(input.pasta ?? "")) };
      if (name === "computador.ler") return { arquivo: String(input.caminho ?? ""), ...(await readText(String(input.caminho ?? ""))) };
      if (name === "computador.escrever") {
        const caminho = String(input.caminho ?? "");
        if (!caminho) return { erro: true, mensagem: "Informe o caminho do arquivo." };
        return { arquivo: caminho, ...(await writeText(caminho, String(input.conteudo ?? ""))) };
      }
    } catch (error) {
      return { erro: true, mensagem: error instanceof Error ? error.message : "Falha no arquivo." };
    }
    throw new BadRequestException({ code: "NOT_FOUND", message: "Ferramenta sem implementação." });
  }

  /** Notion: usa o token salvo nas integrações. Sem token, a ferramenta recusa com mensagem clara. */
  private async runNotion(name: string, input: Record<string, unknown>): Promise<unknown> {
    const token = await this.integrations.secret("notion");
    if (!token) return { erro: true, mensagem: "O Notion não está configurado. Cole o token em Configurações." };
    if (name === "notion.buscar") return { resultados: await searchNotion(token, String(input.consulta ?? input.query ?? "")) };
    if (name === "notion.ler_pagina") {
      const pagina = String(input.pagina ?? "").trim();
      if (!pagina) return { erro: true, mensagem: "Informe o id ou URL da página do Notion." };
      return readNotionPage(token, pagina);
    }
    if (name === "notion.anexar_texto") {
      const pagina = String(input.pagina ?? "").trim();
      const texto = String(input.texto ?? "").trim();
      if (!pagina || !texto) return { erro: true, mensagem: "Informe a página e o texto que deseja anexar." };
      return appendNotionText(token, pagina, texto);
    }
    if (name === "notion.criar_pagina") {
      const pai = String(input.pagina_pai ?? "").trim();
      const titulo = String(input.titulo ?? "").trim();
      if (!pai || !titulo) return { erro: true, mensagem: "Informe o id da página pai e o título." };
      return createNotionPage(token, pai, titulo, String(input.texto ?? ""));
    }
    throw new BadRequestException({ code: "NOT_FOUND", message: "Ferramenta sem implementação." });
  }

  /** Ferramentas do Google: usam a conexão da própria pessoa que pediu. */
  private async runGoogle(name: string, input: Record<string, unknown>): Promise<unknown> {
    let pessoaId = typeof input.pessoaId === "string" ? input.pessoaId : "";
    if (!pessoaId) return { erro: true, mensagem: "Entre na sua conta para usar o Google." };
    if (typeof input.conexao_de === "string" && input.conexao_de.trim()) {
      if (!this.shares) throw new ForbiddenException({ code: "CONEXAO_NAO_LIBERADA", message: "Você não tem acesso a esta conexão." });
      pessoaId = await this.shares.resolveOwner(pessoaId, input.conexao_de.trim());
    }
    if (name === "agenda.listar_eventos") return { eventos: await this.google.listEvents(pessoaId) };
    if (name === "drive.listar_arquivos") return { arquivos: await this.google.listFiles(pessoaId) };
    if (name === "agenda.criar_evento") return this.google.createEvent(pessoaId, input);
    throw new BadRequestException({ code: "NOT_FOUND", message: "Ferramenta sem implementação." });
  }

  private async insert(
    id: string, tool: string, requestedBy: string, status: string,
    input: Record<string, unknown>, output: unknown, approvalId: string | null,
  ): Promise<ToolRun> {
    const result = await this.database.getPool().query(
      `INSERT INTO tool_runs(id, tool, requested_by, status, input, output, approval_id, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $4 = 'done' THEN now() ELSE NULL END)
       RETURNING ${COLUMNS}`,
      [id, tool, requestedBy, status, JSON.stringify(input), output === null ? null : JSON.stringify(output), approvalId],
    );
    return result.rows[0] as ToolRun;
  }
}
