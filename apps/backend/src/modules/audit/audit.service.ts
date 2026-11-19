import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    const days = configuredRetentionDays(process.env.AUDIT_RETENTION_DAYS);
    if (days === null) return;
    this.timer = setInterval(() => void this.sweepOldEvents(days).catch((error) => this.logger.warn(`Limpeza de auditoria falhou: ${error instanceof Error ? error.message : "erro"}`)), 60 * 60_000);
    this.timer.unref();
    void this.sweepOldEvents(days).catch((error) => this.logger.warn(`Limpeza de auditoria falhou: ${error instanceof Error ? error.message : "erro"}`));
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  /** Remove eventos antigos em lotes; execuções ligadas a aprovações pendentes ficam preservadas. */
  async sweepOldEvents(retentionDays: number, batchSize = 500, maxBatches = 100): Promise<number> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) return 0;
    const batch = Math.max(1, Math.min(500, Math.floor(batchSize) || 500));
    const passes = Math.max(1, Math.min(100, Math.floor(maxBatches) || 100));
    let deleted = 0;
    for (let index = 0; index < passes; index += 1) {
      const result = await this.database.getPool().query(
        `WITH lock AS (SELECT pg_try_advisory_xact_lock(4192011) AS acquired), victims AS (
           SELECT event.id FROM audit_events event, lock
           WHERE lock.acquired = true
             AND event.created_at < now() - ($1::text || ' days')::interval
             AND NOT EXISTS (
               SELECT 1 FROM approvals approval
               WHERE approval.status = 'pending'
                 AND event.subject = approval.id::text
             )
           ORDER BY event.created_at ASC
           FOR UPDATE OF event SKIP LOCKED LIMIT $2
         )
         DELETE FROM audit_events event USING victims
         WHERE event.id = victims.id
         RETURNING event.id`,
        [retentionDays, batch],
      );
      const count = result.rowCount ?? 0;
      deleted += count;
      if (count < batch) break;
    }
    return deleted;
  }

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

export function configuredRetentionDays(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 && days <= 36_500 ? days : null;
}
