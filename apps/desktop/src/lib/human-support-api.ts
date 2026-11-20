export type HumanSupportRecord = { id: string; conversationId: string | null; agentId: string | null; requestedBy: string; reason: string; status: "aberto" | "assumido"; claimedBy: string | null; createdAt: string };
export class HumanSupportApi {
  constructor(private readonly request: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  async list(): Promise<HumanSupportRecord[]> {
    const response = await this.request(`${this.baseUrl}/human-support`);
    if (!response.ok) throw new Error(await this.message(response, "Não foi possível carregar os atendimentos."));
    return response.json() as Promise<HumanSupportRecord[]>;
  }
  async update(id: string, action: "claim" | "resolve"): Promise<void> {
    const response = await this.request(`${this.baseUrl}/human-support/${id}/${action}`, { method: "POST" });
    if (!response.ok) throw new Error(await this.message(response, "Não foi possível atualizar o atendimento."));
  }
  private async message(response: Response, fallback: string): Promise<string> {
    const body = await response.json().catch(() => ({})) as { message?: string };
    return body.message ?? fallback;
  }
}
