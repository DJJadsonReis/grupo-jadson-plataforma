export type ModelProviderId = "openai" | "anthropic" | "gemini" | "endpoint";

export interface CatalogueModel {
  provider: ModelProviderId;
  id: string;
  label: string;
}

// IDs mantidos aqui precisam ter uma fonte explícita no código do projeto.
export const MODEL_CATALOGUE: readonly CatalogueModel[] = [
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o mini" },
  { provider: "anthropic", id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { provider: "gemini", id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export const MODEL_PROVIDER_NAMES: Record<ModelProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  endpoint: "Endpoint compatível",
};

export const DEFAULT_MODELS: Partial<Record<ModelProviderId, string>> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.0-flash",
};
