export function formatCostUsd(value: number | null): string {
  if (value === null) return "sem preço cadastrado";
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatTokens(value: number): string {
  return value.toLocaleString("pt-BR");
}
