export type ManagedProviderKind = "openai" | "anthropic" | "gemini" | "xai" | "custom";
export interface SelectableModel { id: string; label: string }

// Lista inicial baseada nos catálogos públicos oficiais de OpenAI, Anthropic, Google Gemini e xAI (consultados em 2026-11-20).
export const MANAGED_MODEL_CATALOGUE: Record<Exclude<ManagedProviderKind, "custom">, SelectableModel[]> = {
  openai: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "gpt-4.1", label: "GPT-4.1" }],
  anthropic: [{ id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" }, { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }],
  gemini: [{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }],
  xai: [{ id: "grok-3-mini", label: "Grok 3 Mini" }, { id: "grok-3", label: "Grok 3" }],
};

export function modelsForProvider(kind: ManagedProviderKind): SelectableModel[] {
  return kind === "custom" ? [] : MANAGED_MODEL_CATALOGUE[kind];
}

// Catálogo legado preservado para consumidores existentes da rota /providers/catalogue.
export type ModelProviderId = "openai" | "anthropic" | "gemini" | "endpoint";
export interface CatalogueModel { provider: ModelProviderId; id: string; label: string }
export const MODEL_CATALOGUE: readonly CatalogueModel[] = [
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o mini" },
  { provider: "anthropic", id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { provider: "gemini", id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];
export const MODEL_PROVIDER_NAMES: Record<ModelProviderId, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", endpoint: "Endpoint compatível" };
export const DEFAULT_MODELS: Partial<Record<ModelProviderId, string>> = { openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", gemini: "gemini-2.0-flash" };
