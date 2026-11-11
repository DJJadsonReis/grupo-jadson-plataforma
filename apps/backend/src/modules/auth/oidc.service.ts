import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { DatabaseService } from "../database/database.service";

export type ProviderId = "google" | "microsoft" | "okta";

interface ProviderConfig {
  id: ProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  /** Microsoft com tenant "common" usa um emissor com modelo; a checagem vira por prefixo. */
  multiTenant: boolean;
}

export interface VerifiedIdentity {
  email: string;
  name: string | null;
  /** Endereço loopback do desktop, se o login começou por lá. */
  returnUri: string | null;
}

/** Só aceita retorno para o próprio computador (127.0.0.1 ou localhost, com porta), caminho /cb. */
export function loopbackReturn(value: string): string | null {
  const match = /^http:\/\/(127\.0\.0\.1|localhost):(\d{1,5})\/cb$/.exec(value.trim());
  if (!match) return null;
  const port = Number(match[2]);
  return port >= 1024 && port <= 65535 ? value.trim() : null;
}

const FLOW_TTL_MS = 10 * 60_000;
const DESKTOP_RETURN = process.env.DESKTOP_LOGIN_RETURN ?? "http://localhost:1420/login-return";

/** Lê os provedores configurados no ambiente. Um provedor só existe se tiver id e segredo. */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const list: ProviderConfig[] = [];
  const add = (id: ProviderId, label: string, prefix: string, issuer: string, multiTenant = false) => {
    const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
    const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
    if (clientId && clientSecret) list.push({ id, label, clientId, clientSecret, issuer, multiTenant });
  };
  add("google", "Google", "GOOGLE", "https://accounts.google.com");
  const tenant = env.MICROSOFT_TENANT_ID?.trim() || "common";
  add("microsoft", "Microsoft", "MICROSOFT", `https://login.microsoftonline.com/${tenant}/v2.0`, tenant === "common");
  const oktaIssuer = env.OKTA_ISSUER?.trim();
  if (oktaIssuer) add("okta", "Okta", "OKTA", oktaIssuer.replace(/\/$/, ""));
  return list;
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** Par PKCE (S256): o verificador fica guardado; só o desafio vai para o provedor. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Login com Google, Microsoft ou Okta (OpenID Connect com PKCE). */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly discoveryCache = new Map<string, Promise<Record<string, string>>>();
  private readonly jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(private readonly database: DatabaseService) {}

  providers(): { id: ProviderId; label: string }[] {
    return providersFromEnv().map(({ id, label }) => ({ id, label }));
  }

  private provider(id: string): ProviderConfig {
    const found = providersFromEnv().find((item) => item.id === id);
    if (!found) throw new BadRequestException({ code: "PROVIDER_DISABLED", message: "Este provedor não está configurado." });
    return found;
  }

  private redirectUri(id: ProviderId): string {
    const base = process.env.OIDC_REDIRECT_BASE?.trim() || "http://127.0.0.1:3333";
    return `${base.replace(/\/$/, "")}/api/v1/auth/callback/${id}`;
  }

  private async discovery(issuer: string): Promise<Record<string, string>> {
    let cached = this.discoveryCache.get(issuer);
    if (!cached) {
      cached = fetch(`${issuer}/.well-known/openid-configuration`).then(async (response) => {
        if (!response.ok) throw new Error(`discovery ${response.status}`);
        return (await response.json()) as Record<string, string>;
      });
      this.discoveryCache.set(issuer, cached);
      cached.catch(() => this.discoveryCache.delete(issuer));
    }
    return cached;
  }

  /** Monta o endereço do provedor e guarda o estado do fluxo (uso único, vale 10 minutos). */
  async startLogin(id: string, returnUri?: string | null): Promise<string> {
    const provider = this.provider(id);
    const loopback = returnUri ? loopbackReturn(returnUri) : null;
    if (returnUri && !loopback) throw new BadRequestException({ code: "INVALID_RETURN", message: "Endereço de retorno não permitido." });
    const config = await this.discovery(provider.issuer);
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    const { verifier, challenge } = pkcePair();
    await this.database.getPool().query(`DELETE FROM auth_flows WHERE expires_at < now()`);
    await this.database.getPool().query(
      `INSERT INTO auth_flows(state, provider, code_verifier, nonce, expires_at, return_uri) VALUES ($1,$2,$3,$4,$5,$6)`,
      [state, provider.id, verifier, nonce, new Date(Date.now() + FLOW_TTL_MS), loopback],
    );
    const url = new URL(config.authorization_endpoint ?? "");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: provider.clientId,
      redirect_uri: this.redirectUri(provider.id),
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  /** Troca o código pelo token de identidade, confere tudo e devolve o e-mail verificado. */
  async finishLogin(id: string, code: string, state: string): Promise<VerifiedIdentity> {
    const provider = this.provider(id);
    const flow = await this.database.getPool().query(
      `DELETE FROM auth_flows WHERE state = $1 AND provider = $2 AND expires_at > now()
       RETURNING code_verifier AS "codeVerifier", nonce, return_uri AS "returnUri"`,
      [state, provider.id],
    );
    if (flow.rowCount === 0) throw new UnauthorizedException({ code: "INVALID_STATE", message: "Pedido de entrada expirado. Tente de novo." });
    const { codeVerifier, nonce, returnUri } = flow.rows[0] as { codeVerifier: string; nonce: string; returnUri: string | null };

    const config = await this.discovery(provider.issuer);
    const response = await fetch(config.token_endpoint ?? "", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(provider.id),
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      this.logger.warn(`Troca de código recusada por ${provider.label}: ${response.status}`);
      throw new UnauthorizedException({ code: "TOKEN_EXCHANGE", message: "O provedor recusou a entrada." });
    }
    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) throw new UnauthorizedException({ code: "NO_ID_TOKEN", message: "O provedor não enviou a identidade." });

    const payload = await this.verifyIdToken(provider, config, tokens.id_token);
    if (payload.nonce !== nonce) throw new UnauthorizedException({ code: "INVALID_NONCE", message: "Identidade não confere com o pedido." });

    const email = String(payload.email ?? payload.preferred_username ?? payload.upn ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new UnauthorizedException({ code: "NO_EMAIL", message: "O provedor não informou um e-mail." });
    if (payload.email_verified === false) throw new UnauthorizedException({ code: "EMAIL_NOT_VERIFIED", message: "O e-mail da conta não está verificado." });
    return { email, name: typeof payload.name === "string" ? payload.name : null, returnUri };
  }

  private async verifyIdToken(provider: ProviderConfig, config: Record<string, string>, idToken: string): Promise<JWTPayload> {
    const jwksUri = config.jwks_uri ?? "";
    let jwks = this.jwksCache.get(jwksUri);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(jwksUri));
      this.jwksCache.set(jwksUri, jwks);
    }
    const options = provider.multiTenant ? { audience: provider.clientId } : { issuer: provider.issuer, audience: provider.clientId };
    try {
      const { payload } = await jwtVerify(idToken, jwks, options);
      if (provider.multiTenant && !String(payload.iss).startsWith("https://login.microsoftonline.com/")) {
        throw new Error("emissor inesperado");
      }
      return payload;
    } catch (error) {
      // Registra só o motivo técnico, nunca o token.
      this.logger.warn(`Token de identidade recusado (${provider.label}): ${error instanceof Error ? error.message : "erro"}`);
      throw new UnauthorizedException({ code: "INVALID_ID_TOKEN", message: "Identidade inválida." });
    }
  }

  /** Para onde o desktop volta depois do login. A sessão vai no fragmento (não chega ao servidor). */
  desktopReturn(params: { session?: string; error?: string }, returnUri?: string | null): string {
    const payload = new URLSearchParams(params.session ? { session: params.session } : { error: params.error ?? "erro" });
    // Retorno local: a sessão vai na query, pois quem recebe é o próprio app. Padrão: fragmento.
    if (returnUri) return `${returnUri}?${payload.toString()}`;
    return `${DESKTOP_RETURN}#${payload.toString()}`;
  }
}
