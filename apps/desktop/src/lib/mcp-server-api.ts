export interface McpServerToken { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export class McpServerApi {
  constructor(private readonly apiFetch: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.apiFetch(`${this.baseUrl}/mcp-server${path}`, init);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message ?? `A API respondeu com HTTP ${response.status}.`);
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  list(): Promise<McpServerToken[]> { return this.request("/tokens"); }
  create(name: string): Promise<{ token: string; record: McpServerToken }> {
    return this.request("/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  }
  revoke(id: string): Promise<{ revoked: boolean }> { return this.request(`/tokens/${encodeURIComponent(id)}`, { method: "DELETE" }); }
}
