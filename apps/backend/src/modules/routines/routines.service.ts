import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { findTool } from "../tools/tools.registry";
import { ToolsService } from "../tools/tools.service";

export const TICK_MS = 60_000;

export interface Routine {
  id: string;
  name: string;
  tool: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
}

/** Próxima execução a partir de agora. Intervalo fora de 1 a 1440 minutos é recusado. */
export function nextRunFrom(now: Date, intervalMinutes: number): Date {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw new BadRequestException({ code: "INVALID_ROUTINE", message: "O intervalo deve ser de 1 a 1440 minutos." });
  }
  return new Date(now.getTime() + intervalMinutes * 60_000);
}

const COLUMNS = `id, name, tool, interval_minutes AS "intervalMinutes", enabled,
  next_run_at AS "nextRunAt", last_run_at AS "lastRunAt", last_status AS "lastStatus"`;

/**
 * Rotinas agendadas. Só ferramentas de leitura podem ser agendadas: as sensíveis precisam de
 * uma pessoa para aprovar, e uma rotina não deve ficar esperando aprovação a cada intervalo.
 */
@Injectable()
export class RoutinesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutinesService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly database: DatabaseService, private readonly tools: ToolsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async create(input: { name: string; tool: string; intervalMinutes: number }): Promise<Routine> {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Dê um nome de até 80 caracteres." });
    const tool = findTool(input.tool);
    if (!tool) throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Ferramenta não encontrada." });
    if (tool.risk !== "read") {
      throw new BadRequestException({ code: "INVALID_ROUTINE", message: "Só ferramentas de leitura podem ser agendadas." });
    }
    const next = nextRunFrom(new Date(), input.intervalMinutes);
    const result = await this.database.getPool().query(
      `INSERT INTO routines(id, name, tool, interval_minutes, next_run_at) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLUMNS}`,
      [randomUUID(), name, tool.name, input.intervalMinutes, next],
    );
    return result.rows[0] as Routine;
  }

  async list(): Promise<Routine[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM routines ORDER BY created_at DESC LIMIT 100`);
    return result.rows as Routine[];
  }

  async setEnabled(id: string, enabled: boolean): Promise<Routine> {
    const result = await this.database.getPool().query(`UPDATE routines SET enabled = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, enabled]);
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Rotina não encontrada." });
    return result.rows[0] as Routine;
  }

  async remove(id: string): Promise<void> {
    const result = await this.database.getPool().query(`DELETE FROM routines WHERE id = $1`, [id]);
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Rotina não encontrada." });
  }

  /** Roda as rotinas vencidas. Não se sobrepõe: se um ciclo ainda estiver rodando, o próximo espera. */
  async tick(now = new Date()): Promise<number> {
    if (this.running || !this.database.isReady()) return 0;
    this.running = true;
    let ran = 0;
    try {
      const due = await this.database.getPool().query(
        `SELECT id, name, tool, interval_minutes AS "intervalMinutes" FROM routines
         WHERE enabled = true AND next_run_at <= $1 ORDER BY next_run_at ASC LIMIT 20`,
        [now],
      );
      for (const row of due.rows as { id: string; name: string; tool: string; intervalMinutes: number }[]) {
        let status = "done";
        try {
          await this.tools.invoke(row.tool, {}, `rotina:${row.name}`);
        } catch (error) {
          status = "failed";
          this.logger.warn(`Rotina ${row.name} falhou: ${error instanceof Error ? error.message : "erro"}`);
        }
        await this.database.getPool().query(
          `UPDATE routines SET last_run_at = $2, last_status = $3, next_run_at = $4 WHERE id = $1`,
          [row.id, now, status, nextRunFrom(now, row.intervalMinutes)],
        );
        ran += 1;
      }
    } catch (error) {
      this.logger.warn(`Agendador não conseguiu ler as rotinas: ${error instanceof Error ? error.message : "erro"}`);
    } finally {
      this.running = false;
    }
    return ran;
  }
}
