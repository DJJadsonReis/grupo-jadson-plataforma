import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";

/** Só o necessário: arquivos que o app criar ou abrir (drive.file) e eventos da agenda. */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.events"];
const FLOW_TTL_MS = 10 * 60 * 1000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleRedirectUri(): string {
  return process.env.GOOGLE_CONNECT_REDIRECT?.trim() || "http://127.0.0.1:3333/api/v1/google/callback";
}

/** Conexão com o Google (Drive e Agenda) de cada pessoa. O refresh token fica cifrado no banco. */
@Injectable()
export class GoogleService {
  private readonly box = new SecretBox();
  private readonly flows = new Map<string, { userId: string; expires: number }>();
  private readonly accessTokens = new Map<string, { token: string; expires: number }>();

  constructor(private readonly database: DatabaseService) {}

  private credentials(): { id: string; secret: string } {
    const id = process.env.GOOGLE_CLIENT_ID?.trim();
    const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!id || !secret) throw new ServiceUnavailableException({ code: "GOOGLE_NOT_CONFIGURED", message: "O Google não está configurado no servidor." });
    return { id, secret };
  }

  /** Endereço para a pessoa autorizar o acesso. O pedido vale 10 minutos e é de uso único. */
  connectUrl(userId: string): string {
    const { id } = this.credentials();
    const state = randomBytes(24).toString("base64url");
    this.prune();
    this.flows.set(state, { userId, expires: Date.now() + FLOW_TTL_MS });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: id,
      redirect_uri: googleRedirectUri(),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return url.toString();
  }

  /** Troca o código pelo refresh token e guarda, cifrado, para a pessoa do pedido. */
  async finishConnect(code: string, state: string): Promise<void> {
    const flow = this.flows.get(state);
    this.flows.delete(state);
    if (!flow || flow.expires < Date.now()) throw new UnauthorizedException({ code: "INVALID_STATE", message: "Pedido de conexão expirado. Tente de novo." });
    const { id, secret } = this.credentials();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
    });
    if (!response.ok) throw new UnauthorizedException({ code: "TOKEN_EXCHANGE", message: "O Google recusou a conexão." });
    const data = (await response.json()) as { refresh_token?: string; scope?: string };
    if (!data.refresh_token) throw new UnauthorizedException({ code: "NO_REFRESH_TOKEN", message: "O Google não liberou acesso contínuo. Tente de novo e aceite as permissões." });
    await this.database.getPool().query(
      `INSERT INTO google_connections(user_id, refresh_token, scope, updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (user_id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, scope = EXCLUDED.scope, updated_at = now()`,
      [flow.userId, this.box.encrypt(data.refresh_token), data.scope ?? GOOGLE_SCOPES.join(" ")],
    );
    this.accessTokens.delete(flow.userId);
  }

  async status(userId: string): Promise<{ connected: boolean }> {
    const result = await this.database.getPool().query(`SELECT 1 FROM google_connections WHERE user_id = $1`, [userId]);
    return { connected: (result.rowCount ?? 0) > 0 };
  }

  async disconnect(userId: string): Promise<void> {
    await this.database.getPool().query(`DELETE FROM google_connections WHERE user_id = $1`, [userId]);
    this.accessTokens.delete(userId);
  }

  /** Token de acesso de curta duração, renovado pelo refresh token da pessoa. */
  async accessToken(userId: string): Promise<string> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expires > Date.now()) return cached.token;
    const result = await this.database.getPool().query(`SELECT refresh_token FROM google_connections WHERE user_id = $1`, [userId]);
    if ((result.rowCount ?? 0) === 0) throw new BadRequestException({ code: "GOOGLE_NOT_CONNECTED", message: "Conecte sua conta Google em Configurações antes de usar Drive ou Agenda." });
    const refreshToken = this.box.decrypt((result.rows[0] as { refresh_token: string }).refresh_token);
    const { id, secret } = this.credentials();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
    });
    if (!response.ok) throw new UnauthorizedException({ code: "GOOGLE_REFRESH_FAILED", message: "A conexão com o Google expirou. Conecte de novo em Configurações." });
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new UnauthorizedException({ code: "GOOGLE_REFRESH_FAILED", message: "O Google não devolveu o acesso." });
    this.accessTokens.set(userId, { token: data.access_token, expires: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000 });
    return data.access_token;
  }

  async listEvents(userId: string): Promise<{ titulo: string; inicio: string | null; fim: string | null }[]> {
    const token = await this.accessToken(userId);
    const params = new URLSearchParams({ maxResults: "10", orderBy: "startTime", singleEvents: "true", timeMin: new Date().toISOString() });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new BadRequestException({ code: "GOOGLE_API", message: `A Agenda respondeu com HTTP ${response.status}.` });
    const data = (await response.json()) as { items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] };
    return (data.items ?? []).map((event) => ({
      titulo: event.summary ?? "(sem título)",
      inicio: event.start?.dateTime ?? event.start?.date ?? null,
      fim: event.end?.dateTime ?? event.end?.date ?? null,
    }));
  }

  async listFiles(userId: string): Promise<{ nome: string; tipo: string; modificado: string | null }[]> {
    const token = await this.accessToken(userId);
    const params = new URLSearchParams({ pageSize: "20", fields: "files(name,mimeType,modifiedTime)" });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new BadRequestException({ code: "GOOGLE_API", message: `O Drive respondeu com HTTP ${response.status}.` });
    const data = (await response.json()) as { files?: { name?: string; mimeType?: string; modifiedTime?: string }[] };
    return (data.files ?? []).map((file) => ({ nome: file.name ?? "(sem nome)", tipo: file.mimeType ?? "", modificado: file.modifiedTime ?? null }));
  }

  async createEvent(userId: string, input: Record<string, unknown>): Promise<{ id: string; link: string | null }> {
    const titulo = String(input.titulo ?? "").trim();
    const inicio = String(input.inicio ?? "");
    const fim = String(input.fim ?? "");
    if (!titulo || Number.isNaN(Date.parse(inicio)) || Number.isNaN(Date.parse(fim))) {
      throw new BadRequestException({ code: "INVALID_EVENT", message: "Informe título e as datas de início e fim (ISO 8601)." });
    }
    const token = await this.accessToken(userId);
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: titulo, start: { dateTime: new Date(inicio).toISOString() }, end: { dateTime: new Date(fim).toISOString() } }),
    });
    if (!response.ok) throw new BadRequestException({ code: "GOOGLE_API", message: `A Agenda recusou o evento (HTTP ${response.status}).` });
    const data = (await response.json()) as { id?: string; htmlLink?: string };
    return { id: data.id ?? "", link: data.htmlLink ?? null };
  }

  private prune(): void {
    const now = Date.now();
    for (const [state, flow] of this.flows) if (flow.expires < now) this.flows.delete(state);
  }
}
