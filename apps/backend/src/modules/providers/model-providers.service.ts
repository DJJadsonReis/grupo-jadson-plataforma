import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";
import { modelsForProvider, ManagedProviderKind, SelectableModel } from "./model-catalogue";
import { isPrivateAgentAddress, validateAgentEndpoint } from "../agents/agent-endpoint";

export interface ModelProviderRow { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; secretCiphertext: string; enabled: boolean; createdAt: Date; updatedAt: Date }
export interface ModelProviderItem { id: string; kind: ManagedProviderKind; name: string; baseUrl: string | null; enabled: boolean; hasKey: boolean; createdAt: Date }
export interface ModelProviderInput { kind?: unknown; name?: unknown; baseUrl?: unknown; apiKey?: unknown; allowLocal?: unknown; enabled?: unknown }
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
const KINDS: ManagedProviderKind[] = ["openai", "anthropic", "gemini", "xai", "custom"];
const DEFAULT_URL: Partial<Record<ManagedProviderKind, string>> = { openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1", gemini: "https://generativelanguage.googleapis.com/v1beta/openai", xai: "https://api.x.ai/v1" };

function privateIp(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip)) return true;
  if (ip.startsWith("::ffff:")) return privateIp(ip.slice(7));
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224;
}

@Injectable()
export class ModelProvidersService {
  private box = new SecretBox();
  private fetcher: Fetcher = (input, init) => fetch(input, init);
  private lookupHost: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);
  private readonly testTimeoutMs = 8000;
  constructor(private readonly database: DatabaseService) {}

  setTestDependencies(fetcher: Fetcher, lookupHost?: (host: string) => Promise<string[]>): void { this.fetcher = fetcher; if (lookupHost) this.lookupHost = lookupHost; }
  setTestSecretBox(box: SecretBox): void { this.box = box; }
  private pool() { return this.database.getPool(); }
  private item(row: ModelProviderRow): ModelProviderItem { return { id: row.id, kind: row.kind, name: row.name, baseUrl: row.baseUrl, enabled: row.enabled, hasKey: Boolean(row.secretCiphertext), createdAt: row.createdAt }; }
  private async find(id: string): Promise<ModelProviderRow> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers WHERE id=$1`, [id]);
    if (!result.rowCount) throw new NotFoundException("Provedor não encontrado.");
    return result.rows[0] as ModelProviderRow;
  }
  async list(): Promise<ModelProviderItem[]> {
    const result = await this.pool().query(`SELECT id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",enabled,created_at AS "createdAt",updated_at AS "updatedAt" FROM model_providers ORDER BY created_at,id`);
    const items = (result.rows as ModelProviderRow[]).map((row) => this.item(row));
    const legacyKey = await this.database.getPool().query("SELECT name FROM integrations WHERE name='modelo_chave'");
    if (legacyKey.rowCount || process.env.OPENAI_API_KEY?.trim()) items.unshift({ id: "legacy", kind: "openai", name: "Configuração anterior", baseUrl: null, enabled: true, hasKey: true, createdAt: new Date(0) });
    return items;
  }
  async selectable() {
    const result = await this.pool().query(`SELECT id,kind,name FROM model_providers WHERE enabled=true AND secret_ciphertext<>'' ORDER BY created_at,id`);
    return (result.rows as { id: string; kind: ManagedProviderKind; name: string }[]).map((row) => ({ providerId: row.id, providerName: row.name, models: modelsForProvider(row.kind) }));
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
    const url = new URL(baseUrl);
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
    if (localHost) { if (!allowLocal || url.protocol !== "http:") throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "Endpoint local exige confirmação explícita." }); return; }
    const addresses = isIP(url.hostname) ? [url.hostname] : await this.lookupHost(url.hostname);
    if (!addresses.length || addresses.some((address) => isPrivateAgentAddress(address) || privateIp(address))) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A URL não pode apontar para um endereço IP privado." });
  }
  async create(input: ModelProviderInput): Promise<ModelProviderItem> {
    if (typeof input.kind !== "string" || !KINDS.includes(input.kind as ManagedProviderKind)) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "Tipo de provedor inválido." });
    const kind = input.kind as ManagedProviderKind;
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O nome deve ter de 1 a 80 caracteres." });
    if (typeof input.apiKey !== "string" || !input.apiKey.trim() || input.apiKey.trim().length > 500) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A chave deve ter de 1 a 500 caracteres." });
    const baseUrl = this.validateBase(kind, input.baseUrl, input.allowLocal);
    if (baseUrl) await this.validateDestination(baseUrl, input.allowLocal === true);
    const result = await this.pool().query(`INSERT INTO model_providers(id,kind,name,base_url,secret_ciphertext) VALUES($1,$2,$3,$4,$5) RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",enabled,created_at AS "createdAt",updated_at AS "updatedAt"`, [randomUUID(), kind, input.name.trim(), baseUrl, this.box.encrypt(input.apiKey.trim())]);
    return this.item(result.rows[0] as ModelProviderRow);
  }
  async patch(id: string, input: ModelProviderInput): Promise<ModelProviderItem> {
    const row = await this.find(id);
    if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80)) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O nome deve ter de 1 a 80 caracteres." });
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "O status habilitado é inválido." });
    let baseUrl = row.baseUrl;
    if (input.baseUrl !== undefined) { baseUrl = this.validateBase(row.kind, input.baseUrl, input.allowLocal); if (baseUrl) await this.validateDestination(baseUrl, input.allowLocal === true); }
    let secret = row.secretCiphertext;
    if (input.apiKey !== undefined && input.apiKey !== "") {
      if (typeof input.apiKey !== "string" || input.apiKey.length > 500) throw new BadRequestException({ code: "INVALID_MODEL_PROVIDER", message: "A chave deve ter até 500 caracteres." });
      secret = this.box.encrypt(input.apiKey.trim());
    }
    const result = await this.pool().query(`UPDATE model_providers SET name=$2,enabled=$3,base_url=$4,secret_ciphertext=$5,updated_at=now() WHERE id=$1 RETURNING id,kind,name,base_url AS "baseUrl",secret_ciphertext AS "secretCiphertext",enabled,created_at AS "createdAt",updated_at AS "updatedAt"`, [id, input.name === undefined ? row.name : (input.name as string).trim(), input.enabled === undefined ? row.enabled : input.enabled, baseUrl, secret]);
    return this.item(result.rows[0] as ModelProviderRow);
  }
  async remove(id: string): Promise<void> { await this.find(id); await this.pool().query("DELETE FROM model_providers WHERE id=$1", [id]); }
  async forChat(id: string): Promise<{ kind: ManagedProviderKind; baseUrl: string | null; apiKey: string }> {
    const row = await this.find(id);
    if (!row.enabled || !row.secretCiphertext) throw new BadRequestException({ code: "PROVIDER_UNAVAILABLE", message: "O provedor selecionado está indisponível." });
    return { kind: row.kind, baseUrl: row.baseUrl, apiKey: this.box.decrypt(row.secretCiphertext) };
  }
  async test(id: string): Promise<{ ok: true; models: SelectableModel[] } | { ok: false; message: string }> {
    const row = await this.find(id);
    if (!row.secretCiphertext) return { ok: false, message: "Nenhuma chave salva para este provedor." };
    const key = this.box.decrypt(row.secretCiphertext);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.testTimeoutMs);
    const root = row.baseUrl ?? DEFAULT_URL[row.kind];
    if (!root) return { ok: false, message: "Este endpoint custom ainda não pode listar modelos automaticamente." };
    const url = row.kind === "anthropic" ? "https://api.anthropic.com/v1/models" : `${root.replace(/\/$/, "")}/models`;
    try {
      const headers = row.kind === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` };
      const response = await this.fetcher(url, { method: "GET", headers, signal: controller.signal, redirect: "manual" });
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
