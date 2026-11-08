import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuditService } from "./audit.service";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  action: string;
  subject: string | null;
  summary: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const COLUMNS = `id, action, subject, summary, payload, status, requested_by AS "requestedBy",
  decided_by AS "decidedBy", decided_at AS "decidedAt", created_at AS "createdAt"`;

/**
 * Fila de aprovação humana. Uma ação sensível cria uma solicitação pendente; só a decisão
 * explícita de uma pessoa a libera. Toda criação e decisão fica registrada na auditoria.
 */
@Injectable()
export class ApprovalsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  async request(input: { action: string; subject?: string | null; summary: string; payload?: Record<string, unknown>; requestedBy?: string }): Promise<Approval> {
    const action = input.action.trim();
    const summary = input.summary.trim();
    if (!action) throw new BadRequestException({ code: "INVALID_APPROVAL", message: "Informe a ação que precisa de aprovação." });
    if (!summary) throw new BadRequestException({ code: "INVALID_APPROVAL", message: "Descreva o que será feito." });
    const id = randomUUID();
    const result = await this.database.getPool().query(
      `INSERT INTO approvals(id, action, subject, summary, payload, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLUMNS}`,
      [id, action, input.subject ?? null, summary, JSON.stringify(input.payload ?? {}), input.requestedBy ?? "system"],
    );
    const approval = result.rows[0] as Approval;
    await this.audit.record({ actor: approval.requestedBy, action: "approval.requested", subject: id, details: { action, summary } });
    return approval;
  }

  async list(status?: ApprovalStatus): Promise<Approval[]> {
    const result = status
      ? await this.database.getPool().query(`SELECT ${COLUMNS} FROM approvals WHERE status = $1 ORDER BY created_at DESC LIMIT 200`, [status])
      : await this.database.getPool().query(`SELECT ${COLUMNS} FROM approvals ORDER BY created_at DESC LIMIT 200`);
    return result.rows as Approval[];
  }

  async decide(id: string, decision: "approved" | "rejected", decidedBy: string): Promise<Approval> {
    const updated = await this.database.getPool().query(
      `UPDATE approvals SET status = $2, decided_by = $3, decided_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
      [id, decision, decidedBy],
    );
    if (updated.rowCount === 0) {
      const existing = await this.database.getPool().query(`SELECT status FROM approvals WHERE id = $1`, [id]);
      if (existing.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Solicitação de aprovação não encontrada." });
      throw new BadRequestException({ code: "ALREADY_DECIDED", message: "Esta solicitação já foi decidida." });
    }
    const approval = updated.rows[0] as Approval;
    await this.audit.record({ actor: decidedBy, action: `approval.${decision}`, subject: id, details: { action: approval.action } });
    return approval;
  }
}
