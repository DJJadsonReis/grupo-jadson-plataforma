import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { MaskedLogger } from "../../common/masked-logger";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ToolsService } from "../tools/tools.service";
import { NotificationsService } from "../notifications/notifications.service";

export const TICK_MS = 60_000;
/** Intervalo mínimo entre execuções: evita que uma frase agende mais do que a pessoa quis. */
export const MIN_INTERVAL_MINUTES = 15;
/** Máximo de rotinas ativas ao mesmo tempo. */
export const MAX_ACTIVE_ROUTINES = 20;
/** Após este número de falhas seguidas, a rotina é desligada em vez de continuar gastando. */
export const MAX_FAILURE_STREAK = 10;
export const ROUTINE_CLAIM_LEASE_MS = 5 * 60_000;

export interface Routine {
  id: string;
  name: string;
  tool: string;
  intervalMinutes: number;
  dailyAt: string | null;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
}

/** Próxima execução a partir de agora. Intervalo fora de 15 a 1440 minutos é recusado. */
export function nextRunFrom(now: Date, intervalMinutes: number): Date {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > 1440) {
    throw new BadRequestException({ code: "INVALID_ROUTINE", message: `O intervalo deve ser de ${MIN_INTERVAL_MINUTES} a 1440 minutos.` });
  }
  return new Date(now.getTime() + intervalMinutes * 60_000);
}

/** Próxima ocorrência diária de HH:MM no fuso local do backend, estritamente após now. */
export function nextDailyRunFrom(now: Date, dailyAt: string): Date {
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(dailyAt)) {
    throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe um horário válido no formato HH:MM (00:00 a 23:59)." });
  }
  const [hours = 0, minutes = 0] = dailyAt.split(":").map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

const COLUMNS = `id, name, tool, interval_minutes AS "intervalMinutes", enabled,
  next_run_at AS "nextRunAt", last_run_at AS "lastRunAt", last_status AS "lastStatus", daily_at AS "dailyAt"`;

/**
 * Rotinas agendadas. Só ferramentas de leitura podem ser agendadas: as sensíveis precisam de
 * uma pessoa para aprovar, e uma rotina não deve ficar esperando aprovação a cada intervalo.
 */
@Injectable()
export class RoutinesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new MaskedLogger(RoutinesService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly database: DatabaseService, private readonly tools: ToolsService, @Optional() private readonly notifications?: NotificationsService) {}

  onModuleInit(): void {
    // The database owns the next firing; overdue routines resume immediately after boot.
    void this.scheduleNextTick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  async create(input: { name: string; tool: string; intervalMinutes?: number; dailyAt?: string; owner?: string }): Promise<Routine> {
    const hasInterval = input.intervalMinutes !== undefined;
    const hasDailyAt = input.dailyAt !== undefined;
    if (hasInterval === hasDailyAt) throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Informe um intervalo ou um horário diário, sem combinar os dois." });
    const name = input.name.trim();
    if (!name || name.length > 80) throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Dê um nome de até 80 caracteres." });
    const tool = this.tools.catalog().find((item) => item.name === input.tool);
    if (!tool) throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Ferramenta não encontrada." });
    if (tool.risk !== "read") {
      throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Só ferramentas de leitura podem ser agendadas." });
    }
    const now = new Date();
    const intervalMinutes = hasDailyAt ? 1440 : input.intervalMinutes!;
    const next = hasDailyAt ? nextDailyRunFrom(now, input.dailyAt!) : nextRunFrom(now, intervalMinutes);
    await this.assertRoomForOneMore();
    const result = await this.database.getPool().query(
      `INSERT INTO routines(id, name, tool, interval_minutes, next_run_at, owner, daily_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNS}`,
      [randomUUID(), name, tool.name, intervalMinutes, next, input.owner ?? "sistema", input.dailyAt ?? null],
    );
    await this.scheduleNextTick();
    return result.rows[0] as Routine;
  }

  /** Lista só as rotinas do dono informado. */
  async list(owner: string): Promise<Routine[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM routines WHERE owner = $1 ORDER BY created_at DESC LIMIT 100`, [owner]);
    return result.rows as Routine[];
  }

  private async activeCount(exceptId?: string): Promise<number> {
    const result = await this.database.getPool().query(
      `SELECT count(*)::int AS n FROM routines WHERE enabled = true AND ($1::uuid IS NULL OR id <> $1)`,
      [exceptId ?? null],
    );
    return (result.rows[0] as { n: number }).n;
  }

  private async assertRoomForOneMore(exceptId?: string): Promise<void> {
    if ((await this.activeCount(exceptId)) >= MAX_ACTIVE_ROUTINES) {
      throw new BadRequestException({ code: "ROUTINE_LIMIT", message: `Já há ${MAX_ACTIVE_ROUTINES} rotinas ativas. Desligue uma antes de ligar outra.` });
    }
  }

  /** Liga ou desliga uma rotina do dono informado. Rotina de outro dono responde como não encontrada. */
  async setEnabled(id: string, enabled: boolean, owner: string): Promise<Routine> {
    if (enabled) {
      const existing = await this.database.getPool().query(`SELECT 1 FROM routines WHERE id = $1 AND owner = $2`, [id, owner]);
      if (existing.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Rotina não encontrada." });
      await this.assertRoomForOneMore(id);
    }
    const result = await this.database.getPool().query(`UPDATE routines SET enabled = $2 WHERE id = $1 AND owner = $3 RETURNING ${COLUMNS}`, [id, enabled, owner]);
    await this.scheduleNextTick();
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Rotina não encontrada." });
    return result.rows[0] as Routine;
  }

  /** Remove uma rotina do dono informado. Rotina de outro dono responde como não encontrada. */
  async remove(id: string, owner: string): Promise<void> {
    const result = await this.database.getPool().query(`DELETE FROM routines WHERE id = $1 AND owner = $2`, [id, owner]);
    await this.scheduleNextTick();
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Rotina não encontrada." });
  }

  /** Roda as rotinas vencidas. Não se sobrepõe: se um ciclo ainda estiver rodando, o próximo espera. */
  async tick(now = new Date()): Promise<number> {
    if (this.running || !this.database.isReady()) return 0;
    this.running = true;
    let ran = 0;
    try {
      const claimToken = randomUUID();
      const leaseUntil = new Date(now.getTime() + ROUTINE_CLAIM_LEASE_MS);
      const due = await this.database.getPool().query(
        `WITH due AS (
           SELECT id FROM routines
           WHERE enabled = true AND next_run_at <= $1
             AND (claim_until IS NULL OR claim_until <= $1)
           ORDER BY next_run_at ASC
           FOR UPDATE SKIP LOCKED LIMIT 20
         )
         UPDATE routines r SET claim_until = $2, claim_token = $3
         FROM due WHERE r.id = due.id
           RETURNING r.id, r.name, r.tool, r.owner, r.interval_minutes AS "intervalMinutes", r.daily_at AS "dailyAt", r.claim_token AS "claimToken"`,
        [now, leaseUntil, claimToken],
      );
      for (const row of due.rows as { id: string; name: string; tool: string; owner: string; intervalMinutes: number; dailyAt: string | null; claimToken: string }[]) {
        let status = "done";
        try {
          await this.tools.invoke(row.tool, {}, `rotina:${row.name}`);
        } catch (error) {
          status = "failed";
          this.logger.warn(`Rotina ${row.name} falhou: ${await this.tools.maskSecretText(error instanceof Error ? error.message : "erro")}`);
          try { await this.notifications?.create({ owner: row.owner || "sistema", kind: "routine.failed", title: `Falha na rotina ${row.name}`.slice(0, 160), body: "Uma rotina falhou durante sua execução.", details: { routineId: row.id } }); } catch { /* notification storage must not alter the routine result */ }
        }
        // Falha soma à sequência; sucesso zera. Ao atingir o limite, a rotina é desligada.
        await this.database.getPool().query(
          `UPDATE routines SET last_run_at = $2, last_status = $3, next_run_at = $4,
             failure_streak = CASE WHEN $3 = 'failed' THEN failure_streak + 1 ELSE 0 END,
             enabled = CASE WHEN $3 = 'failed' AND failure_streak + 1 >= $5 THEN false ELSE enabled END
           , claim_until = NULL, claim_token = NULL
           WHERE id = $1 AND claim_token = $6`,
          [row.id, now, status, row.dailyAt ? nextDailyRunFrom(now, row.dailyAt) : nextRunFrom(now, row.intervalMinutes), MAX_FAILURE_STREAK, row.claimToken],
        );
        if (status === "failed") {
          this.logger.warn(`Rotina ${row.name}: falha registrada (limite de ${MAX_FAILURE_STREAK} falhas seguidas desliga a rotina).`);
        }
        ran += 1;
      }
    } catch (error) {
      this.logger.warn(`Agendador não conseguiu ler as rotinas: ${await this.tools.maskSecretText(error instanceof Error ? error.message : "erro")}`);
    } finally {
      this.running = false;
      await this.scheduleNextTick();
    }
    return ran;
  }

  /** Arm one timer from the earliest persisted firing; overdue work is scheduled now. */
  private async scheduleNextTick(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof this.database.isReady !== "function") return;
    if (!this.database.isReady()) { this.armTimer(TICK_MS); return; }
    try {
      const result = await this.database.getPool().query(`SELECT min(next_run_at) AS "nextRunAt" FROM routines WHERE enabled = true`);
      const next = (result.rows[0] as { nextRunAt: Date | string | null } | undefined)?.nextRunAt;
      if (next) this.armTimer(Math.max(0, new Date(next).getTime() - Date.now()));
    } catch (error) {
      this.logger.warn(`Agendador não conseguiu preparar o próximo disparo: ${await this.tools.maskSecretText(error instanceof Error ? error.message : "erro")}`);
      this.armTimer(TICK_MS);
    }
  }

  private armTimer(delay: number): void {
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref();
  }
}
