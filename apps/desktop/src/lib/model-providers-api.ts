export interface ManagedProvider { id: string; kind: string; name: string; baseUrl: string | null; enabled: boolean; hasKey: boolean; createdAt: string }
export interface ModelOption { id: string; label: string }
export interface ModelTestResult { ok: boolean; models?: ModelOption[]; message?: string }
export class ModelProvidersApi {
  constructor(private readonly apiFetch: (input: string, init?: RequestInit) => Promise<Response>, private readonly baseUrl: string) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.apiFetch(`${this.baseUrl}/model-providers${path}`, init);
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message ?? `A API respondeu com HTTP ${response.status}.`); }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  list(): Promise<ManagedProvider[]> { return this.request(""); }
  selectable(): Promise<{ providerId: string; providerName: string; models: ModelOption[] }[]> { return this.request("/selectable"); }
  create(body: unknown): Promise<ManagedProvider> { return this.request("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  patch(id: string, body: unknown): Promise<ManagedProvider> { return this.request(`/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  remove(id: string): Promise<void> { return this.request(`/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  test(id: string): Promise<ModelTestResult> { return this.request(`/${encodeURIComponent(id)}/test`, { method: "POST" }); }
}
