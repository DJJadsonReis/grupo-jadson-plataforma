import { GoogleService, GOOGLE_SCOPES } from "./google.service";
import { findTool } from "../tools/tools.registry";

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

  describe("createDocument", () => {
    it("registra a criação como sensível, com nome e texto obrigatórios", () => {
      expect(findTool("drive.criar_arquivo")).toMatchObject({
        risk: "sensitive",
        parameters: { required: ["nome", "texto"] },
      });
    });

    const pool = { query: async () => ({ rowCount: 1, rows: [{ refresh_token: "cifrado" }] }) };
    const serviceWithToken = () => {
      const service = new GoogleService({ getPool: () => pool } as never);
      (service as unknown as { accessTokens: Map<string, { token: string; expires: number }> }).accessTokens.set("u1", { token: "token-falso-secreto", expires: Date.now() + 60_000 });
      return service;
    };

    it("envia Google Doc em multipart e devolve id e link", async () => {
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "doc-1", webViewLink: "https://drive.google.test/doc-1" }) } as Response);
      try {
        const result = await serviceWithToken().createDocument("u1", { nome: "  Relatório  ", texto: "Olá, mundo!" });
        expect(result).toEqual({ id: "doc-1", link: "https://drive.google.test/doc-1" });
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({ Authorization: "Bearer token-falso-secreto" });
        const contentType = (init.headers as Record<string, string>)["Content-Type"] ?? "";
        const boundary = contentType.match(/boundary=(.+)$/)?.[1];
        expect(boundary).toBeTruthy();
        const body = String(init.body);
        expect(body).toContain("Content-Type: application/json; charset=UTF-8");
        expect(body).toContain(JSON.stringify({ name: "Relatório", mimeType: "application/vnd.google-apps.document" }));
        expect(body).toContain("Content-Type: text/plain; charset=UTF-8\r\n\r\nOlá, mundo!");
        expect(body).toContain(`--${boundary}--`);
        expect(fetchSpy.mock.calls.map(([, request]) => (request as RequestInit).method ?? "GET")).toEqual(["POST"]);
      } finally { fetchSpy.mockRestore(); }
    });

    it.each([
      ["nome vazio", { nome: "  ", texto: "conteúdo" }],
      ["texto vazio", { nome: "Título", texto: " \n " }],
      ["texto acima do limite em bytes UTF-8", { nome: "Título", texto: "á".repeat(50_001) }],
    ])("valida %s antes da rede", async (_label, input) => {
      const fetchSpy = jest.spyOn(global, "fetch");
      try {
        await expect(serviceWithToken().createDocument("u1", input)).rejects.toMatchObject({ response: { code: "INVALID_DOCUMENT" } });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally { fetchSpy.mockRestore(); }
    });

    it("corta o nome em 200 caracteres", async () => {
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "doc" }) } as Response);
      try {
        await serviceWithToken().createDocument("u1", { nome: "x".repeat(201), texto: "conteúdo" });
        expect(String(fetchSpy.mock.calls[0]?.[1]?.body)).toContain(JSON.stringify({ name: "x".repeat(200), mimeType: "application/vnd.google-apps.document" }));
      } finally { fetchSpy.mockRestore(); }
    });

    it("sanitiza erros do Drive sem expor token ou conteúdo", async () => {
      const texto = "CONTEUDO-PRIVADO-FALSO";
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 403, text: async () => `token-falso-secreto ${texto}` } as Response);
      try {
        await expect(serviceWithToken().createDocument("u1", { nome: "Título", texto })).rejects.toMatchObject({
          response: { code: "GOOGLE_API", message: "O Drive respondeu com HTTP 403." },
        });
        const message = "O Drive respondeu com HTTP 403.";
        expect(message).not.toContain("token-falso-secreto");
        expect(message).not.toContain(texto);
      } finally { fetchSpy.mockRestore(); }
    });
  });
});
