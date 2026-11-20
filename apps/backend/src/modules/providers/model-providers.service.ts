import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";
import { modelsForProvider, ManagedProviderKind, SelectableModel } from "./model-catalogue";
import { validateAgentEndpoint } from "../agents/agent-endpoint";
import { isProviderRedirect, resolveProviderDestination, toProviderResponse } from "./provider-destination";
import { pinnedFetch } from "../tools/page-reader";

export interface ModelProviderRow { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; secretCiphertext: string; models: SelectableModel[]; enabled: boolean; createdAt: Date; updatedAt: Date }
export interface ModelProviderItem { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; enabled: boolean; hasKey: boolean; createdAt: Date; models: SelectableModel[]; discoveryMessage?: string }
export interface ModelProviderInput { kind?: unknown; name?: unknown; baseUrl?: unknown; apiKey?: unknown; allowLocal?: unknown; enabled?: unknown }
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
const KINDS: ManagedProviderKind[] = ["openai", "anthropic", "gemini", "xai", "custom"];
const DEFAULT_URL: Partial<Record<ManagedProviderKind, string>> = { openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta/openai", xai: "https://api.x.ai/v1" };

@Injectable()
export class ModelProvidersService {
  private box = new SecretBox();
  private fetcher: Fetcher = async (input, init) => toProviderResponse(await pinnedFetch(input.toString(), init as Parameters<typeof pinnedFetch>[1]));
  private lookupHost: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);
  private readonly testTimeoutMs = 8000;
  constructor(private readonly database: DatabaseService) {}

  setTestDependencies(fetcher: Fetcher, lookupHost?: (host: string) => Promise<string[]>): void { this.fetcher = fetcher; if (lookupHost) this.lookupHost = lookupHost; }
  setTestSecretBox(box: SecretBox): void { this.box = box; }
  private pool() { return this.database.getPool(); }
  private item(row: ModelProviderRow): ModelProviderItem { return { id: row.id, kind: row.kind, name: row.name, baseUrl: row.baseUrl, enabled: row.enabled, hasKey: Boolean(row.secretCiphertext), createdAt: row.createdAt, models: Array.isArray(row.models) ? row.models : [] }; }
  private async find(id: string): Promise<ModelProviderRow> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers WHERE id=$1`, [id]);
    if (!result.rowCount) throw new NotFoundException("Provedor não encontrado.");
    return result.rows[0] as ModelProviderRow;
  }
  async list(): Promise<ModelProviderItem[]> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers ORDER BY created_at,id`);
    const items = (result.rows as ModelProviderRow[]).map((row) => this.item(row));
    const legacyKey = await this.database.getPool().query("SELECT name FROM integrations WHERE name='modelo_chave'");
    if (legacyKey.rowCount || process.env.OPENAI_API_KEY?.trim()) items.unshift({ id: "legacy", kind: "openai", name: "Configuração anterior", baseUrl: null, enabled: true, hasKey: true, createdAt: new Date(0), models: modelsForProvider("openai") });
    return items;
  }
  async selectable() {
    const result = await this.pool().query(`SELECT id,kind,name,models_json AS models FROM model_providers WHERE enabled=true AND secret_ciphertext<>'' ORDER BY created_at,id`);
    return (result.rows as { id: string; kind: ManagedProviderKind; name: string; models: SelectableModel[] }[]).map((row) => ({ providerId: row.id, providerName: row.name, models: Array.isArray(row.models) && row.models.length ? row.models : modelsForProvider(row.kind) })).filter((row) => row.models.length > 0);
  }
  private validateBase(kind: ManagedProviderKind, raw: unknown, allowLocal: unknown): string | null {
    if (kind !== "custom") {
      if (raw !== undefined) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "URL só pode ser informada para provedor custom." });
      return null;
    }
    if (typeof raw !== "string" || !raw.trim() || raw.length > 500) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "Informe uma URL válida para o endpoint custom." });
    const candidate = raw.trim();
    const localHost = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(candidate);
    if (localHost && allowLocal === true) {
      let parsed: URL;
      try { parsed = new URL(candidate); } catch { throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "Informe uma URL válida para o endpoint custom." }); }
      if (parsed.username || parsed.password) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A URL não pode conter credenciais." });
      return parsed.toString().replace(/\/$/, "");
    }
    if (allowLocal !== undefined && typeof allowLocal !== "boolean") throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A opção endpoint local é inválida." });
    return validateAgentEndpoint(candidate).replace(/\/$/, "");
  }
  private async validateDestination(baseUrl: string, allowLocal: boolean): Promise<void> {
    try { await resolveProviderDestination(baseUrl, allowLocal, this.lookupHost); }
    catch { throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A URL não pode apontar para um endereço IP privado." }); }
  }
  async create(input: ModelProviderInput): Promise<ModelProviderItem> {
    if (typeof input.kind !== "string" || !KINDS.includes(input.kind as ManagedProviderKind)) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "Tipo de provedor inválido." });
    const kind = input.kind as ManagedProviderKind;
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O nome deve ter de 1 a 80 caracteres." });
    if (typeof input.apiKey !== "string" || !input.apiKey.trim() || input.apiKey.trim().length > 500) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A chave deve ter de 1 a 500 caracteres." });
    const baseUrl = this.validateBase(kind, input.baseUrl, input.allowLocal);
    if (baseUrl) await this.validateDestination(baseUrl, input.allowLocal === true);
    const key = input.apiKey.trim();
    const model = { id: randomUUID(), kind, name: input.name.trim(), baseUrl, secretCiphertext: this.box.encrypt(key), models: [], enabled: true, createdAt: new Date(), updatedAt: new Date() } as ModelProviderRow;
    const discovered = await this.discover(model, key);
    if (discovered.ok) model.models = discovered.models;
    const result = await this.pool().query(`INSERT INTO model_providers(id,kind,name,base_url,secret_ciphertext,models_json) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,created_at AS "createdAt",updated_at AS "updatedAt"`, [model.id, kind, model.name, baseUrl, model.secretCiphertext, JSON.stringify(model.models)]);
    const item = this.item(result.rows[0] as ModelProviderRow);
    if (!discovered.ok) item.discoveryMessage = discovered.message;
    return item;
  }
  async patch(id: string, input: ModelProviderInput): Promise<ModelProviderItem> {
    const row = await this.find(id);
    if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80)) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O nome deve ter de 1 a 80 caracteres." });
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O status habilitado é inválido." });
    let baseUrl = row.baseUrl;
    if (input.baseUrl !== undefined) { baseUrl = this.validateBase(row.kind, input.baseUrl, input.allowLocal); if (baseUrl) await this.validateDestination(baseUrl, input.allowLocal === true); }
    let secret = row.secretCiphertext;
    let models = row.models ?? [];
    let discoveryMessage: string | undefined;
    let keyChanged = false;
    if (input.apiKey !== undefined) {
      if (typeof input.apiKey !== "string" || input.apiKey.length > 500) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A chave deve ter até 500 caracteres." });
      const apiKey = input.apiKey.trim();
      if (apiKey) { secret = this.box.encrypt(apiKey); keyChanged = true; }
    }
    if (keyChanged) {
      const discovered = await this.discover({ ...row, baseUrl }, (input.apiKey as string).trim());
      if (discovered.ok) models = discovered.models; else discoveryMessage = discovered.message;
    }
    const result = await this.pool().query(`UPDATE model_providers SET name=$2,enabled=$3,base_url=$4,secret_ciphertext=$5,models_json=$6,updated_at=now() WHERE id=$1 RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,created_at AS "createdAt",updated_at AS "updatedAt"`, [id, input.name === undefined ? row.name : (input.name as string).trim(), input.enabled === undefined ? row.enabled : input.enabled, baseUrl, secret, JSON.stringify(models)]);
    const item = this.item(result.rows[0] as ModelProviderRow);
    if (discoveryMessage) item.discoveryMessage = discoveryMessage;
    return item;
  }
  async remove(id: string): Promise<void> { await this.find(id); await this.pool().query("DELETE FROM model_providers WHERE id=$1", [id]); }
  async forChat(id: string): Promise<{ kind: ManagedProviderKind; baseUrl: string | null; apiKey: string }> {
    const row = await this.find(id);
    if (!row.enabled || !row.secretCiphertext) throw new BadRequestException({ code: "PROVIDER_UNAVAILABLE", message: "O provedor selecionado está indisponível." });
    return { kind: row.kind, baseUrl: row.baseUrl, apiKey: this.box.decrypt(row.secretCiphertext) };
  }
  async validateAgentTarget(id: string, model: string): Promise<void> {
    let row: ModelProviderRow;
    try { row = await this.find(id); } catch { throw new BadRequestException("O provedor informado não existe."); }
    if (!row.enabled || !row.secretCiphertext) throw new BadRequestException("O provedor informado está desabilitado ou sem chave.");
    if (row.kind !== "custom" && !modelsForProvider(row.kind).some((candidate) => candidate.id === model) && !(row.models ?? []).some((candidate) => candidate.id === model)) {
      throw new BadRequestException("O modelo informado não pertence ao catálogo do provedor.");
    }
    if (!model.trim() || model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new BadRequestException("O modelo informado é inválido.");
  }
  async test(id: string): Promise<{ ok: true; models: SelectableModel[] } | { ok: false; message: string }> {
    const row = await this.find(id);
    if (!row.secretCiphertext) return { ok: false, message: "Nenhuma chave salva para este provedor." };
    const result = await this.discover(row, this.box.decrypt(row.secretCiphertext));
    if (result.ok) await this.pool().query("UPDATE model_providers SET models_json=$2,updated_at=now() WHERE id=$1", [id, JSON.stringify(result.models)]);
    return result;
  }
  private async discover(row: ModelProviderRow, key: string): Promise<{ ok: true; models: SelectableModel[] } | { ok: false; message: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.testTimeoutMs);
    const root = row.baseUrl ?? DEFAULT_URL[row.kind];
    if (!root) return { ok: false, message: "Este endpoint custom ainda não pode listar modelos automaticamente." };
    const url = row.kind === "anthropic" ? "https://api.anthropic.com/v1/models" : `${root.replace(/\/$/, "")}/models`;
    try {
      const headers = row.kind === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` };
      // A persisted local URL can only be created after validateBase receives allowLocal=true.
      const allowLocal = row.kind === "custom" && Boolean(row.baseUrl) && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(row.baseUrl!);
      const destination = await resolveProviderDestination(url, allowLocal, this.lookupHost);
      const response = await this.fetcher(destination.url.toString(), { method: "GET", headers, signal: controller.signal, redirect: "manual", address: destination.address } as RequestInit);
      if (isProviderRedirect(response.status)) return { ok: false, message: "O serviço do provedor redirecionou a solicitação." };
      if (response.status === 401 || response.status === 403) return { ok: false, message: "A chave foi recusada pelo provedor." };
      if (!response.ok) return { ok: false, message: `O serviço do provedor respondeu com HTTP ${response.status}.` };
      const payload = await response.json() as { data?: unknown; models?: unknown };
      const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
      const models = raw.flatMap((item): SelectableModel[] => {
        if (!item || typeof item !== "object") return [];
        const model = item as { id?: unknown; name?: unknown; display_name?: unknown };
        const idValue = typeof model.id === "string" ? model.id : typeof model.name === "string" ? model.name : "";
        if (!idValue) return [];
        const label = typeof model.display_name === "string" ? model.display_name : idValue;
        return [{ id: idValue, label }];
      });
      return { ok: true, models };
    } catch {
      return { ok: false, message: controller.signal.aborted ? "O teste de conexão excedeu 8 segundos." : "Não foi possível conectar ao serviço do provedor." };
    } finally { clearTimeout(timeout); }
  }
}
