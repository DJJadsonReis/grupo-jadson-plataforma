import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

export interface FakeNotionServer {
  base: string;
  requests: { method: string; url: string; body: Record<string, unknown> }[];
  close(): Promise<void>;
}

/** API Notion mínima em loopback para testes, sem acesso à internet. */
export async function startFakeNotionServer(): Promise<FakeNotionServer> {
  const requests: FakeNotionServer["requests"] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
      requests.push({ method: request.method ?? "GET", url: `${url.pathname}${url.search}`, body });
      response.setHeader("Content-Type", "application/json");
      if (url.pathname.startsWith("/pages/")) {
        response.end(JSON.stringify({ id: url.pathname.split("/").at(-1), properties: { title: { type: "title", title: [{ plain_text: "Página de teste" }] } } }));
        return;
      }
      if (url.pathname.endsWith("/children") && request.method === "PATCH") {
        response.end(JSON.stringify({ results: body.children ?? [] }));
        return;
      }
      if (url.pathname.endsWith("/children")) {
        const offset = Number(url.searchParams.get("start_cursor") ?? "0");
        const all = Array.from({ length: 120 }, (_, index) => ({ type: "paragraph", paragraph: { rich_text: [{ plain_text: `bloco-${index}` }] } }));
        const results = all.slice(offset, offset + 100);
        response.end(JSON.stringify({ results, has_more: offset + 100 < all.length, next_cursor: offset + 100 < all.length ? String(offset + 100) : null }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "not found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
