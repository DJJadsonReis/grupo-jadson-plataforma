/** Preços em USD por milhão de tokens. O proprietário cadastra modelos confirmados. */
export const MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {};

export type ModelPriceMap = Readonly<Record<string, { input: number; output: number }>>;

export function estimateCostUsd(prices: ModelPriceMap, provider: string, model: string, promptTokens: number, completionTokens: number): number | null {
  const price = prices[`${provider}:${model}`];
  if (!price) return null;
  const clean = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
  return (clean(promptTokens) * clean(price.input) + clean(completionTokens) * clean(price.output)) / 1_000_000;
}
