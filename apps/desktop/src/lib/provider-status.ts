import type { ProviderKeyStatus } from "./model-providers-api";

const LABELS: Record<ProviderKeyStatus, string> = {
  nao_testada: "Não testada", valida: "Válida", sem_modelos: "Sem modelos",
  invalida: "Inválida", limite_atingido: "Limite atingido", erro: "Erro",
};

export function providerStatusLabel(status: ProviderKeyStatus): string { return LABELS[status]; }
export function providerStatusTone(status: ProviderKeyStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "valida") return "success";
  if (status === "invalida" || status === "erro") return "danger";
  if (status === "limite_atingido" || status === "sem_modelos") return "warning";
  return "neutral";
}
export function providerLastTestLabel(value: string | Date | null | undefined): string {
  if (!value) return "Nunca testada";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Nunca testada" : date.toLocaleString("pt-BR");
}
export function providerModelCountLabel(count: number): string { return `${count} ${count === 1 ? "modelo" : "modelos"}`; }
