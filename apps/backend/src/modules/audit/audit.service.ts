import { ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MaskedLogger } from "../../common/masked-logger";
import { randomUUID } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import { AuditEventFilters, decodeAuditCursor, encodeAuditCursor } from "./audit-events.query";

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  subject: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditRetentionSettings {
  retentionDays: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastSweepAt: string | null;
  lastSweepDeleted: number | null;
}

/** Grava e lista eventos de auditoria. Nunca grava conteúdo de mensagens, apenas metadados. */
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new MaskedLogger(AuditService.name);
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runAutomaticSweep().catch((error) => this.logger.warn(`Limpeza de auditoria falhou: ${error instanceof Error ? error.message : "erro"}`)), 60 * 60_000);
    this.timer.unref();
    void this.runAutomaticSweep().catch((error) => this.logger.warn(`Limpeza de auditoria falhou: ${error instanceof Error ? error.message : "erro"}`));
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async getRetentionSettings(): Promise<AuditRetentionSettings> {
    const result = await this.database.getPool().query(
      `SELECT retention_days AS "retentionDays", updated_at AS "updatedAt", updated_by AS "updatedBy",
        last_sweep_at AS "lastSweepAt", last_sweep_deleted AS "lastSweepDeleted"
       FROM audit_settings WHERE id = 1`,
    );
    if (result.rowCount) return result.rows[0] as AuditRetentionSettings;
    return { retentionDays: configuredRetentionDays(process.env.AUDIT_RETENTION_DAYS), updatedAt: null, updatedBy: null, lastSweepAt: null, lastSweepDeleted: null };
  }

  async setRetentionDays(retentionDays: number | null, actor: string): Promise<AuditRetentionSettings> {
    const previous = await this.getRetentionSettings();
    await this.database.getPool().query(
      `INSERT INTO audit_settings(id, retention_days, updated_at, updated_by)
       VALUES (1, $1, now(), $2)
       ON CONFLICT (id) DO UPDATE SET retention_days = EXCLUDED.retention_days, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [retentionDays, actor],
    );
    await this.record({ actor, action: "audit.retention.changed", details: { previous: previous.retentionDays, next: retentionDays } });
    return this.getRetentionSettings();
  }

  async sweepConfiguredNow(actor: string): Promise<{ deleted: number; settings: AuditRetentionSettings }> {
    const client = await this.database.getPool().connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const lock = await client.query("SELECT pg_try_advisory_xact_lock(4192011) AS acquired");
      if (!lock.rows[0]?.acquired) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        throw new ConflictException({ code: "AUDIT_SWEEP_IN_PROGRESS", message: "Uma limpeza da auditoria já está em andamento." });
      }
      const settings = await this.getRetentionSettings();
      const deleted = settings.retentionDays === null ? 0 : await this.sweepOldEvents(settings.retentionDays, 500, 100, client);
      await this.saveSweepResult(deleted, settings.retentionDays, client);
      await this.record({ actor, action: "audit.retention.swept", details: { deleted } }, client);
      await client.query("COMMIT");
      transactionOpen = false;
      return { deleted, settings: await this.getRetentionSettings() };
    } finally {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }

  private async runAutomaticSweep(): Promise<void> {
    const settings = await this.getRetentionSettings();
    if (settings.retentionDays === null) return;
    const deleted = await this.sweepOldEvents(settings.retentionDays);
    await this.saveSweepResult(deleted, settings.retentionDays);
  }

  private async saveSweepResult(deleted: number, retentionDays: number | null, client?: PoolClient): Promise<void> {
    await (client ?? this.database.getPool()).query(
      `INSERT INTO audit_settings(id, retention_days, last_sweep_at, last_sweep_deleted)
       VALUES (1, $1, now(), $2)
       ON CONFLICT (id) DO UPDATE SET last_sweep_at = now(), last_sweep_deleted = EXCLUDED.last_sweep_deleted`,
      [retentionDays, deleted],
    );
  }

  /** Remove eventos antigos em lotes; execuções ligadas a aprovações pendentes ficam preservadas. */
  async sweepOldEvents(retentionDays: number, batchSize = 500, maxBatches = 100, client?: PoolClient): Promise<number> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) return 0;
    const batch = Math.max(1, Math.min(500, Math.floor(batchSize) || 500));
    const passes = Math.max(1, Math.min(100, Math.floor(maxBatches) || 100));
    let deleted = 0;
    for (let index = 0; index < passes; index += 1) {
      const result = await (client ?? this.database.getPool()).query(
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

  async record(input: { actor?: string; action: string; subject?: string | null; details?: Record<string, unknown> }, client?: PoolClient): Promise<void> {
    await (client ?? this.database.getPool()).query(
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

  async search(filters: AuditEventFilters): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: (position: number) => string, value: unknown) => { values.push(value); conditions.push(sql(values.length)); };
    if (filters.action) add((n) => `action = $${n}`, filters.action);
    if (filters.actor) add((n) => `actor = $${n}`, filters.actor);
    if (filters.from) add((n) => `created_at >= $${n}::timestamptz`, filters.from);
    if (filters.to) add((n) => `created_at < $${n}::timestamptz`, filters.to);
    if (filters.cursor) {
      const cursor = decodeAuditCursor(filters.cursor);
      values.push(cursor.createdAt, cursor.id);
      conditions.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(filters.limit + 1);
    const result = await this.database.getPool().query(
      `SELECT id, actor, action, subject, details, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM audit_events${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    const rows = result.rows as AuditEvent[];
    const hasMore = rows.length > filters.limit;
    const items = rows.slice(0, filters.limit);
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id }) : null };
  }
}

export function configuredRetentionDays(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 && days <= 3650 ? days : null;
}
