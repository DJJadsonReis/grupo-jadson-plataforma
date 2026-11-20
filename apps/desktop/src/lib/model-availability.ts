export type ModelAvailability = "disponivel" | "indisponivel" | "nao_verificado";

export function availabilityLabel(status: ModelAvailability | undefined): string {
  if (status === "disponivel") return "Disponível";
  if (status === "indisponivel") return "Indisponível";
  return "Não verificado";
}

export function blocksModelSave(status: ModelAvailability | undefined): boolean {
  return status === "indisponivel";
}
