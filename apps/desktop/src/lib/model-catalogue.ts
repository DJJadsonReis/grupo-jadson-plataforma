export type CatalogueModel = { provider: string; id: string; label: string };
export type CatalogueProvider = { id: string; name: string; configured: boolean; defaultModel: string | null; models: CatalogueModel[] };

export function groupCatalogue(data: unknown): CatalogueProvider[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is CatalogueProvider => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && typeof item.configured === "boolean" && Array.isArray(item.models)))
    .map((item) => ({ ...item, models: item.models.filter((model): model is CatalogueModel => Boolean(model && typeof model.id === "string" && typeof model.label === "string")) }));
}

export function suggestModels(data: unknown, query: string): CatalogueModel[] {
  const needle = query.trim().toLocaleLowerCase();
  return groupCatalogue(data).flatMap((provider) => provider.models).filter((model) => !needle || `${model.id} ${model.label}`.toLocaleLowerCase().includes(needle));
}
