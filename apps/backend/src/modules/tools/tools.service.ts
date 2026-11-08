import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ApprovalsService } from "../audit/approvals.service";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { MemoryService } from "../memory/memory.service";
import { findTool, TOOL_DEFINITIONS, ToolDefinition } from "./tools.registry";

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

@Injectable()
export class ToolsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly memory: MemoryService,
  ) {}

  catalog(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  /** Usa uma ferramenta. Leitura roda na hora; sensível fica pendente até aprovação. */
  async invoke(name: string, input: Record<string, unknown>, requestedBy: string): Promise<ToolRun> {
    const tool = findTool(name);
    if (!tool) throw new NotFoundException({ code: "NOT_FOUND", message: "Ferramenta não encontrada." });
    const id = randomUUID();

    if (tool.risk === "sensitive") {
      const approval = await this.approvals.request({
        action: `tool.${tool.name}`,
        subject: id,
        summary: tool.description,
        payload: input,
        requestedBy,
      });
      return this.insert(id, tool.name, requestedBy, "pending_approval", input, null, approval.id);
    }

    const output = await this.runTool(tool.name, input);
    await this.audit.record({ actor: requestedBy, action: "tool.run", subject: tool.name, details: { risk: tool.risk } });
    return this.insert(id, tool.name, requestedBy, "done", input, output, null);
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
    const output = await this.runTool(run.tool, run.input);
    await this.audit.record({ actor, action: "tool.run", subject: run.tool, details: { approvalId: run.approvalId } });
    await this.database.getPool().query(
      `UPDATE tool_runs SET status = 'done', output = $2, finished_at = now() WHERE id = $1`,
      [runId, JSON.stringify(output)],
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

  /** As únicas ações que existem hoje. Nenhuma toca o sistema operacional. */
  private async runTool(name: string, _input: Record<string, unknown>): Promise<unknown> {
    if (name === "tempo.agora") return { agora: new Date().toISOString() };
    if (name === "memoria.listar") return { itens: await this.memory.list() };
    if (name === "memoria.apagar_tudo") {
      const removed = await this.database.getPool().query(`DELETE FROM memories WHERE owner = 'local'`);
      return { apagadas: removed.rowCount ?? 0 };
    }
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
