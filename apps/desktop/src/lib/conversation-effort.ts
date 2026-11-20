export type ConversationEffort = "baixo" | "medio" | "alto";
export const CONVERSATION_EFFORT_OPTIONS = [
  { value: "baixo", label: "Baixo" }, { value: "medio", label: "Médio" }, { value: "alto", label: "Alto" },
] as const;
export function isConversationEffort(value: unknown): value is ConversationEffort {
  return value === "baixo" || value === "medio" || value === "alto";
}
export function effortLabel(value: unknown): string {
  return value === null || value === undefined ? "Padrão" : CONVERSATION_EFFORT_OPTIONS.find((item) => item.value === value)?.label ?? "Padrão";
}
export function shouldShowEffort(supports: unknown): boolean { return supports === true; }

export class ConversationEffortApi {
  constructor(private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  async get(id: string): Promise<ConversationEffort | null> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${id}/reasoning-effort`);
    if (!response.ok) throw new Error("Não foi possível ler o esforço da conversa.");
    const body = await response.json() as { effort?: unknown };
    if (body.effort !== null && body.effort !== undefined && !isConversationEffort(body.effort)) throw new Error("O nível de esforço recebido é inválido.");
    return body.effort == null ? null : body.effort;
  }
  async set(id: string, effort: ConversationEffort | null): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${id}/reasoning-effort`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ effort }) });
    if (!response.ok) throw new Error("Não foi possível salvar o esforço da conversa.");
  }
}
