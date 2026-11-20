import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Put, Query, Req } from "@nestjs/common";
import { AdminOnly } from "../auth/roles";
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

  @AdminOnly() @Get("prices") listPrices() { return this.usage.listPrices(); }

  @AdminOnly() @Put("prices") @HttpCode(HttpStatus.OK)
  async setPrice(@Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!isPriceInput(body)) throw new BadRequestException("Informe provedor, modelo e preços válidos entre US$ 0 e US$ 1.000 por milhão de tokens.");
    return this.usage.setPrice({ ...body, provider: body.provider.trim(), model: body.model.trim() }, request.principal?.id ?? "sistema");
  }

  @AdminOnly() @Delete("prices/:provider/:model") @HttpCode(HttpStatus.OK)
  async removePrice(@Param("provider") provider: string, @Param("model") model: string, @Req() request: PrincipalRequest) {
    const removed = await this.usage.removePrice(provider, model, request.principal?.id ?? "sistema");
    if (!removed) throw new NotFoundException("Preço não encontrado.");
    return { removed: true };
  }

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

function isPriceInput(value: unknown): value is { provider: string; model: string; inputUsdPerMillion: number; outputUsdPerMillion: number } {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.provider === "string" && input.provider.trim().length > 0 && input.provider.trim().length <= 120
    && typeof input.model === "string" && input.model.trim().length > 0 && input.model.trim().length <= 120
    && isValidPrice(input.inputUsdPerMillion) && isValidPrice(input.outputUsdPerMillion);
}

function isValidPrice(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000; }
