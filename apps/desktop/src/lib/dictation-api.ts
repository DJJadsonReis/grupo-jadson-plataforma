import type { DictationClient, ModelStatus } from "./dictation-session";

export class DictationHttpClient implements DictationClient {
  constructor(private readonly baseUrl: string, private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch) {}
  async status(): Promise<ModelStatus> { return this.request<ModelStatus>("/dictation/status"); }
  async download(): Promise<ModelStatus> { return this.request<ModelStatus>("/dictation/model/download", "POST"); }
  async transcribe(samples: Float32Array): Promise<string> {
    const bytes = new Uint8Array(samples.length * 4);
    const view = new DataView(bytes.buffer);
    samples.forEach((sample, index) => view.setFloat32(index * 4, sample, true));
    const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
    const result = await this.request<{ text: string }>("/dictation/transcribe", "POST", { samples: btoa(binary) });
    return result.text;
  }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const error = new Error("Falha na solicitação de ditado.") as Error & { status: number }; error.status = response.status; throw error; }
    return response.json() as Promise<T>;
  }
}
