import { Controller, Get, Query, Req } from "@nestjs/common";
import { UsageService } from "./usage.service";

interface PrincipalRequest { principal?: { id: string; role: string } }

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

  /** Consumo do usuário autenticado, ou de todas as pessoas para administradores. */
  @Get("summary")
  async summary(@Query("days") days: string | undefined, @Req() request: PrincipalRequest) {
    const safeDays = clampDays(Number(days ?? DEFAULT_DAYS));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    const principal = request.principal ?? { id: "sistema", role: "admin" };
    const summary = await this.usage.summaryForOwner(principal.role === "admin" ? null : principal.id, since);
    return { days: safeDays, since, ...summary, agents: summary.byAgent.map(({ agentId, totalTokens, calls }) => ({ agentId: agentId ?? null, totalTokens, calls })) };
  }
}
