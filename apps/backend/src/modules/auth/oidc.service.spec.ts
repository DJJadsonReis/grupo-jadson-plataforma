import { UnauthorizedException } from "@nestjs/common";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { loopbackReturn, OidcService, pkcePair, providersFromEnv } from "./oidc.service";

const ISSUER = "https://accounts.google.com";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const CLIENT = "cliente-teste.apps.googleusercontent.com";

async function setup(options: { nonce?: string; emailVerified?: boolean; audience?: string; flowFound?: boolean; email?: string }) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const idToken = await new SignJWT({
    email: options.email ?? "Pessoa@Exemplo.com",
    email_verified: options.emailVerified ?? true,
    name: "Pessoa",
    nonce: options.nonce ?? "n-123",
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(options.audience ?? CLIENT)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/.well-known/openid-configuration")) {
      return json({ authorization_endpoint: `${ISSUER}/o/oauth2/v2/auth`, token_endpoint: `${ISSUER}/token`, jwks_uri: JWKS_URL });
    }
    if (url === `${ISSUER}/token`) return json({ id_token: idToken });
    if (url === JWKS_URL) return json({ keys: [jwk] });
    return new Response("nao esperado", { status: 500 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  const query = jest.fn(async (sql: string) => {
    if (sql.includes("DELETE FROM auth_flows WHERE state")) {
      return options.flowFound === false
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [{ codeVerifier: "verifier", nonce: "n-123" }] };
    }
    return { rowCount: 0, rows: [] };
  });
  const service = new OidcService({ getPool: () => ({ query }) } as never);
  // Chaves de teste: o JWKS local substitui a busca de rede feita pela biblioteca.
  (service as unknown as { jwksCache: Map<string, unknown> }).jwksCache.set(JWKS_URL, createLocalJWKSet({ keys: [jwk as never] }));
  return { service, query };
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT;
  process.env.GOOGLE_CLIENT_SECRET = "segredo-teste";
});
afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe("providersFromEnv", () => {
  it("só lista provedores com id e segredo", () => {
    expect(providersFromEnv({})).toEqual([]);
    expect(providersFromEnv({ GOOGLE_CLIENT_ID: "a" })).toEqual([]);
    expect(providersFromEnv({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }).map((p) => p.id)).toEqual(["google"]);
  });

  it("marca a Microsoft com tenant 'common' como multi-tenant", () => {
    const list = providersFromEnv({ MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b" });
    expect(list[0]?.multiTenant).toBe(true);
    const single = providersFromEnv({ MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b", MICROSOFT_TENANT_ID: "1234" });
    expect(single[0]?.multiTenant).toBe(false);
  });
});

describe("pkcePair", () => {
  it("gera desafio S256 do verificador", () => {
    const { verifier, challenge } = pkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("OidcService.finishLogin", () => {
  it("aceita token válido e devolve o e-mail em minúsculas", async () => {
    const { service } = await setup({});
    const identity = await service.finishLogin("google", "codigo", "estado");
    expect(identity.email).toBe("pessoa@exemplo.com");
  });

  it("recusa estado desconhecido ou expirado", async () => {
    const { service } = await setup({ flowFound: false });
    await expect(service.finishLogin("google", "codigo", "estado")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recusa nonce diferente do pedido", async () => {
    const { service } = await setup({ nonce: "outro" });
    await expect(service.finishLogin("google", "codigo", "estado")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recusa token emitido para outro cliente", async () => {
    const { service } = await setup({ audience: "outro-cliente" });
    await expect(service.finishLogin("google", "codigo", "estado")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recusa e-mail não verificado", async () => {
    const { service } = await setup({ emailVerified: false });
    await expect(service.finishLogin("google", "codigo", "estado")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recusa provedor não configurado", async () => {
    const { service } = await setup({});
    await expect(service.finishLogin("okta", "codigo", "estado")).rejects.toBeInstanceOf(Error);
  });
});

describe("retorno loopback", () => {
  it("aceita só 127.0.0.1 ou localhost, porta alta e caminho /cb", () => {
    expect(loopbackReturn("http://127.0.0.1:53000/cb")).toBe("http://127.0.0.1:53000/cb");
    expect(loopbackReturn("http://localhost:61234/cb")).toBe("http://localhost:61234/cb");
    expect(loopbackReturn("http://evil.com/cb")).toBeNull();
    expect(loopbackReturn("http://127.0.0.1:80/cb")).toBeNull();
    expect(loopbackReturn("http://127.0.0.1:3000/outro")).toBeNull();
    expect(loopbackReturn("https://127.0.0.1:53000/cb")).toBeNull();
  });

  it("leva a sessão na query quando o retorno é local", () => {
    const { service } = { service: new OidcService({} as never) };
    expect(service.desktopReturn({ session: "abc" }, "http://127.0.0.1:53000/cb")).toBe("http://127.0.0.1:53000/cb?session=abc");
    expect(service.desktopReturn({ error: "sem_acesso" }, null)).toContain("#error=sem_acesso");
  });
});
