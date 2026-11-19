import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { PAGE_READ_MAX_BYTES, PAGE_READ_MAX_TEXT, pinnedFetch, readPage } from "./page-reader";
import { UNTRUSTED_TAG } from "./untrusted-content";

function response(body: string, type = "text/html", status = 200, location: string | null = null) {
  const bytes = new TextEncoder().encode(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: (name: string) => name === "content-type" ? type : name === "location" ? location : null }, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), text: async () => body };
}

describe("page-reader", () => {
  it("extrai texto e devolve o conteúdo de página dentro de untrusted_data", async () => {
    const result = await readPage("https://example.com", {
      lookupHost: async () => ["93.184.216.34"],
      fetcher: async () => response("<html><title>Exemplo</title><script>injetado</script><p>Olá &amp; mundo</p></html>") as never,
    });
    expect(result.title).toBe("Exemplo");
    expect(result.text).toBe("Olá & mundo");
    expect(result.untrusted).toContain(`<${UNTRUSTED_TAG} source="web page">`);
    expect(result.untrusted).not.toContain("injetado");
  });

  it.each(["http://localhost", "http://127.0.0.2", "http://10.1.2.3", "http://172.20.0.1", "http://192.168.1.2", "http://169.254.1.1", "http://[::1]"])("bloqueia endereço privado %s antes do fetch", async (url) => {
    const fetcher = jest.fn();
    await expect(readPage(url, { fetcher: fetcher as never })).rejects.toThrow(/bloqueado/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bloqueia DNS que resolve para endereço privado", async () => {
    await expect(readPage("https://public.example", { lookupHost: async () => ["8.8.8.8", "10.0.0.2"] })).rejects.toThrow(/privado/);
  });

  it("revalida redirecionamento para não permitir acesso à rede local", async () => {
    const fetcher = jest.fn().mockResolvedValue(response("", "text/html", 302, "http://127.0.0.1/secret"));
    await expect(readPage("https://public.example", { lookupHost: async () => ["8.8.8.8"], fetcher: fetcher as never })).rejects.toThrow(/bloqueado/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recusa páginas grandes e limita o texto extraído", async () => {
    await expect(readPage("https://example.com", { lookupHost: async () => ["8.8.8.8"], fetcher: async () => response("x".repeat(PAGE_READ_MAX_BYTES + 1)) as never })).rejects.toThrow(/limite/);
    const result = await readPage("https://example.com", { lookupHost: async () => ["8.8.8.8"], fetcher: async () => response(`<p>${"a".repeat(PAGE_READ_MAX_TEXT + 10)}</p>`) as never });
    expect(result.text).toHaveLength(PAGE_READ_MAX_TEXT);
  });

  it("conecta ao IP validado sem resolver o nome de novo (contra DNS rebinding)", async () => {
    const server: Server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<p>pinado</p>"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const { port } = server.address() as AddressInfo;
      // "rebind.invalid" não resolve em nenhum DNS; a conexão só funciona se o IP validado for usado.
      const response = await pinnedFetch(`http://rebind.invalid:${port}/`, { signal: new AbortController().signal, redirect: "manual", headers: {}, address: "127.0.0.1" });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("<p>pinado</p>");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("aborta no timeout e recusa respostas que não sejam texto", async () => {
    await expect(readPage("https://example.com", { lookupHost: async () => ["8.8.8.8"], timeoutMs: 5, fetcher: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))) as never })).rejects.toThrow(/Tempo limite/);
    await expect(readPage("https://example.com", { lookupHost: async () => ["8.8.8.8"], fetcher: async () => response("binary", "application/pdf") as never })).rejects.toThrow(/Formato/);
  });
});
