export type PriceFieldResult = { value: number } | { error: string };

export function parsePriceField(value: string): PriceFieldResult {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return { error: "Informe um preço." };
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return { error: "Digite um número válido." };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) return { error: "O preço deve ficar entre US$ 0 e US$ 1.000." };
  return { value: parsed };
}

export function formatModelPriceUsd(value: number): string {
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}
