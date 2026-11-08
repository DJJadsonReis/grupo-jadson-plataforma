import { Controller, Get, Query } from "@nestjs/common";
import { UsageService } from "./usage.service";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/** Limita o período consultado entre 1 e 365 dias; valores inválidos usam o padrão de 30. */
export function clampDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.min(Math.max(Math.floor(value), 1), MAX_DAYS);
}

@Controller("usage")
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  /** Consumo de tokens por agente nos últimos N dias. Não inclui conteúdo de mensagens. */
  @Get("summary")
  async summary(@Query("days") days?: string) {
    const safeDays = clampDays(Number(days ?? DEFAULT_DAYS));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    const agents = await this.usage.summaryByAgent(since);
    return { days: safeDays, since, agents };
  }
}
