import { appendNotionText, parseNotionPageId, readNotionPage } from "./notion";
import { startFakeNotionServer } from "./fixtures/fake-notion-server";

const ID = "01234567-89ab-cdef-0123-456789abcdef";

describe("cliente Notion — leitura e anexo", () => {
  it("normaliza ids e URLs de página e rejeita entrada inválida", () => {
    expect(parseNotionPageId(ID)).toBe(ID);
    expect(parseNotionPageId(ID.replace(/-/g, ""))).toBe(ID);
    expect(parseNotionPageId(`https://www.notion.so/Titulo-${ID.replace(/-/g, "")}`)).toBe(ID);
    expect(() => parseNotionPageId("sem identificador")).toThrow("id ou URL válida");
  });

  it("pagina blocos em chamadas de até 100 e limita o texto a 6000 caracteres", async () => {
    const fake = await startFakeNotionServer();
    try {
      const result = await readNotionPage("token-falso-1234567890", ID, fake.base);
      expect(result.titulo).toBe("Página de teste");
      expect(result.texto).toContain("bloco-119");
      expect(fake.requests.filter((request) => request.url.includes("/children"))).toHaveLength(2);
      expect(fake.requests[2]?.url).toContain("start_cursor=100");
      const hugeFake = await readNotionPage("token-falso-1234567890", ID, fake.base);
      expect(hugeFake.texto.length).toBeLessThanOrEqual(6000);
    } finally { await fake.close(); }
  });

  it("mapeia blocos textuais e tipos desconhecidos, corta leitura longa", async () => {
    const originalFetch = globalThis.fetch;
    const types = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote", "callout", "code", "image"];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/pages/")
        ? { id: ID, properties: { title: { type: "title", title: [{ plain_text: "Título" }] } } }
        : { results: Array.from({ length: 80 }, (_, index) => { const type = types[index % types.length] as string; return { type, [type]: { rich_text: [{ plain_text: "x".repeat(type === "paragraph" ? 100 : 80) }] } }; }), has_more: false };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await readNotionPage("token-falso-1234567890", ID, "http://fake.local/v1");
      expect(result.truncado).toBe(true);
      expect(result.texto.length).toBe(6000);
      for (const type of types.slice(0, -1)) expect(result.texto).toContain("x");
      expect(result.texto).toContain("[bloco image]");
    } finally { globalThis.fetch = originalFetch; }
  });

  it("renderiza os tipos de bloco suportados como texto", async () => {
    const originalFetch = globalThis.fetch;
    const types = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote", "callout", "code", "image"];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const body = String(input).includes("/pages/")
        ? { id: ID, properties: { title: { type: "title", title: [{ plain_text: "Título" }] } } }
        : { results: types.map((type) => ({ type, [type]: { rich_text: [{ plain_text: `texto-${type}` }] } })), has_more: false };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await readNotionPage("token-falso-1234567890", ID, "http://fake.local/v1");
      for (const type of types.slice(0, -1)) expect(result.texto).toContain(`texto-${type}`);
      expect(result.texto).toContain("[bloco image]");
    } finally { globalThis.fetch = originalFetch; }
  });

  it("anexa parágrafos com PATCH e recusa mais de 50 ou parágrafo acima do limite", async () => {
    const fake = await startFakeNotionServer();
    try {
      expect(await appendNotionText("token-falso-1234567890", ID, "um\ndois\n\ntrês", fake.base)).toEqual({ acrescentados: 3 });
      expect(fake.requests[0]).toMatchObject({ method: "PATCH", url: `/blocks/${ID}/children` });
      expect((fake.requests[0]?.body.children as unknown[])).toHaveLength(3);
      const count = fake.requests.length;
      await expect(appendNotionText("token-falso-1234567890", ID, Array(51).fill("p").join("\n"), fake.base)).rejects.toThrow("50 parágrafos");
      await expect(appendNotionText("token-falso-1234567890", ID, "x".repeat(1901), fake.base)).rejects.toThrow("1900 caracteres");
      expect(fake.requests).toHaveLength(count);
    } finally { await fake.close(); }
  });

  it("converte erros 401 em mensagem curta sem corpo bruto nem token", async () => {
    const originalFetch = globalThis.fetch;
    const token = "token-secreto-de-teste-123456";
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: token }), { status: 401 })) as typeof fetch;
    try {
      let caught: unknown;
      try { await readNotionPage(token, ID, "http://fake.local/v1"); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect(String(caught)).toContain("Token inválido ou expirado");
      expect(String(caught)).not.toContain(token);
      expect(String(caught)).not.toContain("not found");
    } finally { globalThis.fetch = originalFetch; }
  });
});
