export const OPERATION_MODE_OPTIONS = [
  { value: "automatico", label: "Automático", shortcut: "1" },
  { value: "manual", label: "Manual", shortcut: "2" },
  { value: "aceitar_edicoes", label: "Aceitar edições", shortcut: "3" },
  { value: "planejamento", label: "Planejamento", shortcut: "4" },
  { value: "ignorar_permissoes", label: "Ignorar permissões" },
] as const;

export type DesktopOperationMode = (typeof OPERATION_MODE_OPTIONS)[number]["value"];

export function operationModeForShortcut(key: string, altKey: boolean): DesktopOperationMode | undefined {
  if (!altKey) return undefined;
  return ({ "1": "automatico", "2": "manual", "3": "aceitar_edicoes", "4": "planejamento" } as Record<string, DesktopOperationMode>)[key];
}

export function visibleOperationModes(isAdmin: boolean) {
  return OPERATION_MODE_OPTIONS.filter((item) => isAdmin || item.value !== "ignorar_permissoes");
}

export class OperationModesApi {
  constructor(private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  async get(conversationId: string): Promise<{ mode: DesktopOperationMode; inherited: boolean }> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${conversationId}/operation-mode`);
    if (!response.ok) throw new Error("Não foi possível ler o modo da conversa.");
    return response.json() as Promise<{ mode: DesktopOperationMode; inherited: boolean }>;
  }
  async set(conversationId: string, mode: DesktopOperationMode, confirmation?: string): Promise<{ mode: DesktopOperationMode; inherited: boolean }> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${conversationId}/operation-mode`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...(confirmation ? { confirmation } : {}) }),
    });
    const body = await response.json().catch(() => ({})) as { message?: string; mode?: DesktopOperationMode; inherited?: boolean };
    if (!response.ok) throw new Error(body.message ?? "Não foi possível salvar o modo da conversa.");
    return { mode: body.mode ?? mode, inherited: body.inherited ?? false };
  }
}
