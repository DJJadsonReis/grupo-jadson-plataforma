import type { AgentModelRouting, AgentModelTarget } from "../agents/agents.service";

export type TaskKind = "text" | "vision" | "code";
export type ModelAttempt = AgentModelTarget & { fallback: boolean };

export function classifyTask(text: string, hasImage: boolean, attachments: { name?: string; type?: string }[] = []): TaskKind {
  if (hasImage) return "vision";
  if (/```/.test(text) || attachments.some((item) => /(?:javascript|typescript|python|text\/x-|application\/(?:json|.*script))/.test(item.type ?? "") || /\.(?:js|jsx|ts|tsx|py|rs|go|java|c|cpp|h|cs|php|rb|sql|sh|json|yaml|yml)$/i.test(item.name ?? ""))) return "code";
  return "text";
}

export function modelAttempts(primary: AgentModelTarget, routing: AgentModelRouting | undefined, task: TaskKind): ModelAttempt[] {
  const taskTarget = task === "text" ? undefined : routing?.taskModels?.[task];
  const candidates = [{ ...(taskTarget ?? primary), fallback: false }, ...(routing?.fallbacks ?? []).map((item) => ({ ...item, fallback: true }))];
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = `${item.providerId.toLowerCase()}:${item.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isRetryableModelError(error: unknown, hasSentText: boolean, signalAborted: boolean): boolean {
  if (hasSentText || signalAborted) return false;
  const value = error as { status?: number; response?: { statusCode?: number; upstreamStatus?: number; modelUnavailable?: boolean; code?: string }; name?: string; code?: string };
  if (signalAborted) return false;
  if (value?.name === "AbortError" || value?.name === "TimeoutError" || value?.code === "ABORT_ERR" || value?.code === "ETIMEDOUT") return true;
  if (value?.response?.code === "PROVIDER_UNAVAILABLE") return true;
  const status = value?.response?.upstreamStatus ?? value?.status ?? value?.response?.statusCode;
  if (status === 401 || status === 403 || status === 404 || status === 429 || (typeof status === "number" && status >= 500)) return true;
  if (status === 400) return value?.response?.modelUnavailable === true;
  return status === undefined || status === 0;
}

export function failureReason(error: unknown): string {
  const value = error as { response?: { upstreamStatus?: number }; status?: number; name?: string; code?: string };
  const status = value?.response?.upstreamStatus ?? value?.status;
  if (typeof status === "number") return `http-${status}`;
  if (value?.name === "AbortError" || value?.name === "TimeoutError" || value?.code === "ETIMEDOUT") return "timeout";
  return "network-error";
}
