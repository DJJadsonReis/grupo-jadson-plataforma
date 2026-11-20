export type ProviderKind = "openai" | "anthropic" | "gemini" | "xai" | "custom";
export interface ProviderDraft { kind: ProviderKind; name: string; baseUrl: string; apiKey: string; allowLocal: boolean }
export interface SelectableModel { id: string; label: string; supportsEffort?: boolean }
export interface SelectableProvider { providerId: string; providerName: string; models: SelectableModel[] }
export interface ProviderOption { value: string; label: string; providerId: string; model: string; supportsEffort: boolean }
export const DEFAULT_BASE_URL: Partial<Record<ProviderKind, string>> = {
  openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta/openai", xai: "https://api.x.ai/v1",
};
export function defaultBaseUrl(kind: ProviderKind): string { return DEFAULT_BASE_URL[kind] ?? ""; }
export function validateProviderDraft(draft: ProviderDraft, editing = false): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 80) return "O nome deve ter de 1 a 80 caracteres.";
  if (!editing && (!draft.apiKey.trim() || draft.apiKey.trim().length > 500)) return "A chave deve ter de 1 a 500 caracteres.";
  if (editing && draft.apiKey.length > 500) return "A chave deve ter até 500 caracteres.";
  if (draft.kind === "custom") {
    if (!draft.baseUrl.trim()) return "Informe a URL do endpoint custom.";
    if (draft.baseUrl.length > 500) return "A URL deve ter até 500 caracteres.";
    try {
      const url = new URL(draft.baseUrl);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || (url.protocol !== "https:" && !(draft.allowLocal && local && url.protocol === "http:"))) return "Use uma URL HTTPS válida, sem credenciais; HTTP só é permitido para endpoint local marcado.";
    } catch { return "Informe uma URL válida para o endpoint custom."; }
  }
  return null;
}
export function groupSelectableProviders(data: unknown): ProviderOption[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const provider = raw as Partial<SelectableProvider>;
    if (typeof provider.providerId !== "string" || typeof provider.providerName !== "string" || !Array.isArray(provider.models)) return [];
    const providerId = provider.providerId;
    const providerName = provider.providerName;
    return provider.models.flatMap((model) => {
      if (!model || typeof model.id !== "string" || typeof model.label !== "string") return [];
      return [{ value: `${providerId}:${model.id}`, label: `${providerName} — ${model.label}`, providerId, model: model.id, supportsEffort: model.supportsEffort === true }];
    });
  });
}
export function hasLegacyProviderKey(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.some((item) => {
    if (!item || typeof item !== "object") return false;
    const provider = item as { id?: unknown; hasKey?: unknown };
    return provider.id === "legacy" && provider.hasKey === true;
  });
}
