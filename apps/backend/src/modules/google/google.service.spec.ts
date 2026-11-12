import { GoogleService, GOOGLE_SCOPES } from "./google.service";

describe("GoogleService", () => {
  const original = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "cliente-teste";
    process.env.GOOGLE_CLIENT_SECRET = "segredo-teste";
  });

  afterAll(() => {
    process.env.GOOGLE_CLIENT_ID = original.id;
    process.env.GOOGLE_CLIENT_SECRET = original.secret;
  });

  it("monta o endereço de autorização só com os escopos de Drive (arquivos do app) e Agenda, com refresh token", () => {
    const service = new GoogleService({ getPool: () => ({}) } as never);
    const url = new URL(service.connectUrl("pessoa-1"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cliente-teste");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(GOOGLE_SCOPES).not.toContain("https://www.googleapis.com/auth/drive");
  });

  it("recusa a ação sem conexão da pessoa", async () => {
    const pool = { query: async () => ({ rowCount: 0, rows: [] }) };
    const service = new GoogleService({ getPool: () => pool } as never);
    await expect(service.listFiles("pessoa-sem-conexao")).rejects.toMatchObject({ response: { code: "GOOGLE_NOT_CONNECTED" } });
  });

  it("recusa a callback com estado desconhecido", async () => {
    const service = new GoogleService({ getPool: () => ({}) } as never);
    await expect(service.finishConnect("codigo", "estado-inventado")).rejects.toMatchObject({ response: { code: "INVALID_STATE" } });
  });
});
