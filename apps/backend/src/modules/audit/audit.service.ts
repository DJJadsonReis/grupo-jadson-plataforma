import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  subject: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/** Grava e lista eventos de auditoria. Nunca grava conteúdo de mensagens, apenas metadados. */
@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: { actor?: string; action: string; subject?: string | null; details?: Record<string, unknown> }): Promise<void> {
    await this.database.getPool().query(
      `INSERT INTO audit_events(id, actor, action, subject, details) VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), input.actor ?? "system", input.action, input.subject ?? null, JSON.stringify(input.details ?? {})],
    );
  }

  async list(limit: number): Promise<AuditEvent[]> {
    const parsed = Math.floor(limit);
    const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
    const result = await this.database.getPool().query(
      `SELECT id, actor, action, subject, details, created_at AS "createdAt"
       FROM audit_events ORDER BY created_at DESC LIMIT $1`,
      [safeLimit],
    );
    return result.rows as AuditEvent[];
  }
}
