export type ReasoningEffort = "baixo" | "medio" | "alto";
export type EffortProvider = "openai" | "anthropic" | "gemini" | "xai" | "custom" | "ollama";

const SUPPORTED_MODELS: Partial<Record<EffortProvider, readonly string[]>> = {
  // A lista é intencionalmente explícita: modelos desconhecidos não recebem parâmetros extras.
  openai: ["o1", "o1-mini", "o3", "o3-mini", "o4-mini"],
  anthropic: ["claude-sonnet-4-5"],
  gemini: ["gemini-2.5-pro"],
  xai: ["grok-3-mini", "grok-3"],
};

export function supportsEffort(provider: string, model: string): boolean {
  return (SUPPORTED_MODELS[provider as EffortProvider] ?? []).includes(model);
}

export function providerEffortValue(effort: ReasoningEffort): "low" | "medium" | "high" {
  return effort === "baixo" ? "low" : effort === "medio" ? "medium" : "high";
}

export function anthropicThinkingBudget(effort: ReasoningEffort): number {
  return effort === "baixo" ? 1024 : effort === "medio" ? 4096 : 8192;
}

export function anthropicThinking(effort: ReasoningEffort, maxTokens: number): { budgetTokens: number; maxTokens: number } {
  const budgetTokens = anthropicThinkingBudget(effort);
  return { budgetTokens, maxTokens: Math.max(maxTokens, budgetTokens + 1) };
}
