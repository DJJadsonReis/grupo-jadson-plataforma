export interface ConversationModelChoice { providerId: string; model: string }
export interface ConversationModelOption extends ConversationModelChoice { providerName: string; label: string }
export function conversationModelLabel(choice: ConversationModelChoice | null, providers: { providerId: string; providerName: string; models: { id: string; label: string }[] }[]): string {
  if (!choice) return "Padrão do agente";
  const provider = providers.find((item) => item.providerId === choice.providerId);
  const model = provider?.models.find((item) => item.id === choice.model);
  return `${provider?.providerName ?? "Provedor indisponível"} · ${model?.label ?? choice.model}`;
}
export function initialConversationModel(providerId: string | null | undefined, model: string | null | undefined): string {
  return providerId && model ? `${providerId}:${model}` : "";
}
export function modelChoiceForSelection(value: string): ConversationModelChoice | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  return { providerId: value.slice(0, separator), model: value.slice(separator + 1) };
}
export function modelSelectionError(): string { return "Não foi possível salvar o modelo desta conversa."; }

export class ConversationModelApi {
  constructor(private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  async get(id: string): Promise<ConversationModelChoice | null> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${id}/model`);
    if (!response.ok) throw new Error("Não foi possível ler o modelo da conversa.");
    const body = await response.json() as { providerId?: unknown; model?: unknown };
    if (body.providerId == null && body.model == null) return null;
    if (typeof body.providerId !== "string" || typeof body.model !== "string") throw new Error("A escolha de modelo recebida é inválida.");
    return { providerId: body.providerId, model: body.model };
  }
  async set(id: string, choice: ConversationModelChoice | null): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/conversations/${id}/model`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice ? { providerId: choice.providerId, model: choice.model } : { providerId: null, model: null }) });
    if (!response.ok) throw new Error(modelSelectionError());
  }
}
