import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";
import { modelsForProvider, ManagedProviderKind, SelectableModel } from "./model-catalogue";
import { validateAgentEndpoint } from "../agents/agent-endpoint";
import { isProviderRedirect, resolveProviderDestination, toProviderResponse } from "./provider-destination";
import { pinnedFetch } from "../tools/page-reader";
import { supportsEffort } from "../chat/model-effort";
import { providerKeyStatus, ProviderKeyStatus } from "./provider-key-status";

export interface ModelProviderRow { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; secretCiphertext: string; models: SelectableModel[]; enabled: boolean; createdAt: Date; updatedAt: Date; lastTestStatus?: ProviderKeyStatus | null; lastTestAt?: Date | null }
export type ModelAvailabilityStatus = "disponivel" | "indisponivel" | "nao_verificado";
export interface SelectableModelWithAvailability extends SelectableModel { availability: ModelAvailabilityStatus; checkedAt: Date | null }
export interface ModelProviderItem { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; enabled: boolean; hasKey: boolean; createdAt: Date; models: SelectableModelWithAvailability[]; keyStatus: ProviderKeyStatus; lastTestAt: Date | null; modelCount: number; discoveryMessage?: string }
export interface ModelProviderInput { kind?: unknown; name?: unknown; baseUrl?: unknown; apiKey?: unknown; allowLocal?: unknown; enabled?: unknown }
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
const KINDS: ManagedProviderKind[] = ["openai", "anthropic", "gemini", "xai", "custom"];
const DEFAULT_URL: Partial<Record<ManagedProviderKind, string>> = { openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta/openai", xai: "https://api.x.ai/v1" };

@Injectable()
export class ModelProvidersService {
  private box = new SecretBox();
  private fetcher: Fetcher = async (input, init) => toProviderResponse(await pinnedFetch(input.toString(), init as Parameters<typeof pinnedFetch>[1]));
  private lookupHost: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);
  private readonly testTimeoutMs = 10_000;
  constructor(private readonly database: DatabaseService) {}

  setTestDependencies(fetcher: Fetcher, lookupHost?: (host: string) => Promise<string[]>): void { this.fetcher = fetcher; if (lookupHost) this.lookupHost = lookupHost; }
  setTestSecretBox(box: SecretBox): void { this.box = box; }
  private pool() { return this.database.getPool(); }
  private async item(row: ModelProviderRow): Promise<ModelProviderItem> {
    const base = Array.isArray(row.models) ? row.models : [];
    let states: { model_id: string; status: ModelAvailabilityStatus; checked_at: Date }[] = [];
    try { states = (await this.pool().query("SELECT model_id,status,checked_at FROM model_availability WHERE provider_id=$1", [row.id])).rows as typeof states; } catch { /* migration is applied during service startup */ }
    const byModel = new Map(states.map((state) => [state.model_id, state]));
    const known = new Map(base.map((model) => [model.id, model]));
    for (const state of states) if (!known.has(state.model_id)) known.set(state.model_id, { id: state.model_id, label: state.model_id });
    const lastTestStatus = row.lastTestStatus;
    const lastTestAt = row.lastTestAt ?? null;
    const models = [...known.values()].map((model) => { const state = byModel.get(model.id); return { ...model, availability: state?.status ?? "nao_verificado", checkedAt: state?.checked_at ?? null }; });
    const availableCount = models.filter((model) => model.availability === "disponivel").length;
    return { id: row.id, kind: row.kind, name: row.name, baseUrl: row.baseUrl, enabled: row.enabled, hasKey: Boolean(row.secretCiphertext), createdAt: row.createdAt, models, keyStatus: lastTestStatus ?? "nao_testada", lastTestAt, modelCount: states.length ? availableCount : models.length };
  }
  private async saveAvailability(id: string, models: SelectableModel[], available: Set<string> | null): Promise<void> {
    for (const model of models) {
      const status: ModelAvailabilityStatus = available === null ? "nao_verificado" : available.has(model.id) ? "disponivel" : "indisponivel";
      await this.pool().query(`INSERT INTO model_availability(provider_id,model_id,status,checked_at) VALUES($1,$2,$3,now()) ON CONFLICT(provider_id,model_id) DO UPDATE SET status=EXCLUDED.status,checked_at=EXCLUDED.checked_at`, [id, model.id, status]);
    }
  }
  private unavailableMessage(model: string, name: string): string { return `O modelo “${model}” está indisponível no provedor “${name}”. Escolha outro modelo antes de continuar.`; }
  private async find(id: string): Promise<ModelProviderRow> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,last_test_status AS "lastTestStatus",last_test_at AS "lastTestAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers WHERE id=$1`, [id]);
    if (!result.rowCount) throw new NotFoundException("Provedor não encontrado.");
    return result.rows[0] as ModelProviderRow;
  }
  async list(): Promise<ModelProviderItem[]> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,last_test_status AS "lastTestStatus",last_test_at AS "lastTestAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers ORDER BY created_at,id`);
    const items = await Promise.all((result.rows as ModelProviderRow[]).map((row) => this.item(row)));
    const legacyKey = await this.database.getPool().query("SELECT name FROM integrations WHERE name='modelo_chave'");
    if (legacyKey.rowCount || process.env.OPENAI_API_KEY?.trim()) items.unshift({ id: "legacy", kind: "openai", name: "Configuração anterior", baseUrl: null, enabled: true, hasKey: true, createdAt: new Date(0), keyStatus: "nao_testada", lastTestAt: null, modelCount: modelsForProvider("openai").length, models: modelsForProvider("openai").map((model) => ({ ...model, availability: "nao_verificado", checkedAt: null })) });
    return items;
  }
  async selectable() {
    const result = await this.pool().query(`SELECT id,kind,name,models_json AS models FROM model_providers WHERE enabled=true AND secret_ciphertext<>'' ORDER BY created_at,id`);
    return (result.rows as { id: string; kind: ManagedProviderKind; name: string; models: SelectableModel[] }[]).map((row) => ({ providerId: row.id, providerName: row.name, models: (Array.isArray(row.models) && row.models.length ? row.models : modelsForProvider(row.kind)).map((model) => ({ ...model, supportsEffort: supportsEffort(row.kind, model.id) })) })).filter((row) => row.models.length > 0);
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
    const testStatus = providerKeyStatus(discovered.ok ? discovered : { ok: false, ...(discovered.httpStatus === undefined ? {} : { httpStatus: discovered.httpStatus }), message: discovered.message });
    const result = await this.pool().query(`INSERT INTO model_providers(id,kind,name,base_url,secret_ciphertext,models_json,last_test_status,last_test_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,last_test_status AS "lastTestStatus",last_test_at AS "lastTestAt",created_at AS "createdAt",updated_at AS "updatedAt"`, [model.id, kind, model.name, baseUrl, model.secretCiphertext, JSON.stringify(model.models), testStatus]);
    await this.saveAvailability(model.id, model.models, discovered.ok ? new Set(model.models.map((entry) => entry.id)) : null);
    const item = await this.item(result.rows[0] as ModelProviderRow);
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
    let discoverySucceeded = false;
    let discoveryStatus: ProviderKeyStatus | null = null;
    if (keyChanged) {
      const discovered = await this.discover({ ...row, baseUrl }, (input.apiKey as string).trim());
      if (discovered.ok) { models = discovered.models; discoverySucceeded = true; } else discoveryMessage = discovered.message;
      discoveryStatus = providerKeyStatus(discovered.ok ? discovered : { ok: false, ...(discovered.httpStatus === undefined ? {} : { httpStatus: discovered.httpStatus }), message: discovered.message });
    }
    const result = await this.pool().query(`UPDATE model_providers SET name=$2,enabled=$3,base_url=$4,secret_ciphertext=$5,models_json=$6,${keyChanged ? "last_test_status=$7,last_test_at=now()," : ""}updated_at=now() WHERE id=$1 RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",models_json AS models,enabled,last_test_status AS "lastTestStatus",last_test_at AS "lastTestAt",created_at AS "createdAt",updated_at AS "updatedAt"`, keyChanged ? [id, input.name === undefined ? row.name : (input.name as string).trim(), input.enabled === undefined ? row.enabled : input.enabled, baseUrl, secret, JSON.stringify(models), discoveryStatus] : [id, input.name === undefined ? row.name : (input.name as string).trim(), input.enabled === undefined ? row.enabled : input.enabled, baseUrl, secret, JSON.stringify(models)]);
    if (keyChanged) {
      const knownModels = [...models, ...(row.models ?? []).filter((old) => !models.some((model) => model.id === old.id))];
      await this.saveAvailability(id, knownModels, discoverySucceeded ? new Set(models.map((model) => model.id)) : null);
    }
    const item = await this.item(result.rows[0] as ModelProviderRow);
    if (discoveryMessage) item.discoveryMessage = discoveryMessage;
    return item;
  }
  async remove(id: string): Promise<void> { await this.find(id); await this.pool().query("DELETE FROM model_providers WHERE id=$1", [id]); }
  async forChat(id: string): Promise<{ kind: ManagedProviderKind; baseUrl: string | null; apiKey: string }> {
    const row = await this.find(id);
    if (!row.enabled || !row.secretCiphertext) throw new BadRequestException({ code: "PROVIDER_UNAVAILABLE", message: "O provedor selecionado está indisponível." });
    return { kind: row.kind, baseUrl: row.baseUrl, apiKey: this.box.decrypt(row.secretCiphertext) };
  }
  async kindForChat(id: string): Promise<ManagedProviderKind> { return (await this.find(id)).kind; }
  async validateAgentTarget(id: string, model: string): Promise<void> {
    let row: ModelProviderRow;
    try { row = await this.find(id); } catch { throw new BadRequestException("O provedor informado não existe."); }
    if (!row.enabled || !row.secretCiphertext) throw new BadRequestException("O provedor informado está desabilitado ou sem chave.");
    if (row.kind !== "custom" && !(row.models ?? []).some((candidate) => candidate.id === model) && !modelsForProvider(row.kind).some((candidate) => candidate.id === model) && await this.availability(id, model) !== "indisponivel") {
      throw new BadRequestException("O modelo informado não pertence ao catálogo do provedor.");
    }
    if (!model.trim() || model.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(model)) throw new BadRequestException("O modelo informado é inválido.");
    const state = await this.availability(id, model);
    if (state === "indisponivel") throw new BadRequestException({ code: "MODEL_UNAVAILABLE", message: this.unavailableMessage(model, row.name) });
  }
  async availability(id: string, model: string): Promise<ModelAvailabilityStatus> {
    try {
    const result = await this.pool().query("SELECT status FROM model_availability WHERE provider_id=$1 AND model_id=$2", [id, model]);
    return (result.rows[0] as { status?: ModelAvailabilityStatus } | undefined)?.status ?? "nao_verificado";
    } catch { return "nao_verificado"; }
  }
  async assertAvailable(id: string, model: string): Promise<void> {
    if (await this.availability(id, model) !== "indisponivel") return;
    const row = await this.find(id);
    throw new BadRequestException({ code: "MODEL_UNAVAILABLE", message: this.unavailableMessage(model, row.name) });
  }
  async markUnavailable(id: string, model: string): Promise<void> { await this.saveAvailability(id, [{ id: model, label: model }], new Set()); }
  async markDiscoveredModelUnavailable(id: string, model: string): Promise<void> {
    const current = (await this.find(id)).models ?? [];
    const allModels = [...current, ...(current.some((item) => item.id === model) ? [] : [{ id: model, label: model }])];
    await this.saveAvailability(id, allModels, new Set(current.filter((item) => item.id !== model).map((item) => item.id)));
  }
  async test(id: string): Promise<{ ok: true; models: SelectableModel[] } | { ok: false; message: string }> {
    const row = await this.find(id);
    const result = !row.secretCiphertext ? { ok: false as const, message: "Nenhuma chave salva para este provedor." } : await this.discover(row, this.box.decrypt(row.secretCiphertext));
    const status = providerKeyStatus(result.ok ? result : { ok: false, ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }), message: result.message });
    if (result.ok) await this.pool().query("UPDATE model_providers SET models_json=$2,last_test_status=$3,last_test_at=now(),updated_at=now() WHERE id=$1", [id, JSON.stringify(result.models), status]);
    else await this.pool().query("UPDATE model_providers SET last_test_status=$2,last_test_at=now(),updated_at=now() WHERE id=$1", [id, status]);
    const currentModels = result.ok ? result.models : row.models ?? [];
    await this.saveAvailability(id, currentModels, result.ok ? new Set(result.models.map((model) => model.id)) : null);
    return result.ok ? { ...result, models: (await this.item({ ...row, models: currentModels, lastTestStatus: status, lastTestAt: new Date() })).models } : result;
  }
  async checkModels(id: string): Promise<ModelProviderItem> {
    const row = await this.find(id);
    const result = !row.secretCiphertext ? { ok: false as const, message: "Nenhuma chave salva para este provedor." } : await this.discover(row, this.box.decrypt(row.secretCiphertext));
    const status = providerKeyStatus(result.ok ? result : { ok: false, ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }), message: result.message });
    const testedAt = new Date();
    const previousModels = row.models ?? [];
    const models = result.ok ? result.models : previousModels;
    if (result.ok) await this.pool().query("UPDATE model_providers SET models_json=$2,last_test_status=$3,last_test_at=now(),updated_at=now() WHERE id=$1", [id, JSON.stringify(models), status]);
    else await this.pool().query("UPDATE model_providers SET last_test_status=$2,last_test_at=now(),updated_at=now() WHERE id=$1", [id, status]);
    const knownModels = result.ok ? [...models, ...previousModels.filter((old) => !models.some((model) => model.id === old.id))] : models;
    await this.saveAvailability(id, knownModels, result.ok ? new Set(models.map((model) => model.id)) : null);
    const item = await this.item({ ...row, models, lastTestStatus: status, lastTestAt: testedAt });
    if (result.ok) item.models = [...models.map((model) => ({ ...model, availability: "disponivel" as const, checkedAt: new Date() })), ...previousModels.filter((old) => !models.some((model) => model.id === old.id)).map((model) => ({ ...model, availability: "indisponivel" as const, checkedAt: new Date() }))];
    else item.models = models.map((model) => ({ ...model, availability: "nao_verificado", checkedAt: new Date() }));
    if (!result.ok) item.discoveryMessage = result.message;
    return item;
  }
  private async discover(row: ModelProviderRow, key: string): Promise<{ ok: true; models: SelectableModel[] } | { ok: false; message: string; httpStatus?: number }> {
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
      if (response.status === 401 || response.status === 403) return { ok: false, httpStatus: response.status, message: "A chave foi recusada pelo provedor." };
      if (!response.ok) return { ok: false, httpStatus: response.status, message: `O serviço do provedor respondeu com HTTP ${response.status}.` };
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
      return { ok: false, message: controller.signal.aborted ? "A checagem excedeu 10 segundos." : "Não foi possível conectar ao serviço do provedor." };
    } finally { clearTimeout(timeout); }
  }
}
