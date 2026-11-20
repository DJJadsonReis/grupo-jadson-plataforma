export interface AgentModelTarget { providerId: string; model: string }
export interface AgentModelRouting { fallbacks: AgentModelTarget[]; taskModels?: { vision?: AgentModelTarget; code?: AgentModelTarget } }
export const MAX_AGENT_FALLBACKS = 5;

export function moveFallback(items: AgentModelTarget[], index: number, delta: -1 | 1): AgentModelTarget[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const result = [...items];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}

export function removeFallback(items: AgentModelTarget[], index: number): AgentModelTarget[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function addFallback(items: AgentModelTarget[], target: AgentModelTarget): AgentModelTarget[] {
  if (items.length >= MAX_AGENT_FALLBACKS) throw new Error("São permitidos até cinco modelos reserva.");
  if (items.some((item) => item.providerId.toLowerCase() === target.providerId.toLowerCase() && item.model === target.model)) throw new Error("Este modelo já está na lista de reservas.");
  return [...items, target];
}

export function validateFallbacks(items: AgentModelTarget[]): string | null {
  if (items.length > MAX_AGENT_FALLBACKS) return "São permitidos até cinco modelos reserva.";
  const keys = items.map((item) => `${item.providerId.toLowerCase()}:${item.model}`);
  return new Set(keys).size === keys.length ? null : "A lista de modelos reserva não pode ter duplicados.";
}

export function emptyModelRouting(): AgentModelRouting { return { fallbacks: [] }; }
