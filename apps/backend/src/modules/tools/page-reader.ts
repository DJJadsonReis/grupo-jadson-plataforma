import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { markUntrusted } from "./untrusted-content";

export const PAGE_READ_MAX_BYTES = 1_000_000;
export const PAGE_READ_MAX_TEXT = 20_000;
export const PAGE_READ_TIMEOUT_MS = 8_000;

type Lookup = (hostname: string) => Promise<string[]>;
type FetchResponse = { ok: boolean; status: number; headers: { get(name: string): string | null }; body?: ReadableStream<Uint8Array> | null; text(): Promise<string> };
/** `address` é o IP já validado: a conexão usa esse IP, sem resolver o nome de novo (evita DNS rebinding). */
type FetchInit = { signal: AbortSignal; redirect: "manual"; headers: Record<string, string>; address: string };
type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

/**
 * Faz a requisição HTTP(S) conectando ao IP validado. O nome do host continua no cabeçalho Host e no
 * certificado TLS (SNI), mas nunca é resolvido de novo pelo DNS.
 */
export function pinnedFetch(url: string, init: FetchInit): Promise<FetchResponse> {
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const family = isIP(init.address);
  // O `lookup` substitui a resolução de DNS: sempre devolve o IP validado, seja qual for o nome pedido.
  const pinned = (_host: string, options: unknown, callback: (...args: unknown[]) => void) => {
    if ((options as { all?: boolean } | undefined)?.all) callback(null, [{ address: init.address, family }]);
    else callback(null, init.address, family);
  };
  return new Promise((resolve, reject) => {
    const req = send(target, { method: "GET", headers: init.headers, signal: init.signal, lookup: pinned as never }, (res) => {
      const status = res.statusCode ?? 0;
      const headers = {
        get: (name: string) => {
          const value = res.headers[name.toLowerCase()];
          return Array.isArray(value) ? value.join(", ") : value ?? null;
        },
      };
      resolve({
        ok: status >= 200 && status < 300,
        status,
        headers,
        body: Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>,
        text: async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of res) chunks.push(Buffer.from(chunk));
          return Buffer.concat(chunks).toString("utf8");
        },
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function privateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return privateIp(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const parts = normalized.split(".").map(Number);
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224;
}

/** Valida o destino e devolve a URL com o IP que será usado na conexão (o primeiro, todos já checados). */
async function validateUrl(raw: string, lookupHost: Lookup): Promise<{ url: URL; address: string }> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("URL inválida."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("A página precisa usar HTTP ou HTTPS.");
  if (url.username || url.password) throw new Error("URLs com credenciais não são permitidas.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Endereço local bloqueado.");
  const literalIp = isIP(hostname);
  const addresses = literalIp ? [hostname] : await lookupHost(hostname);
  if (!addresses.length || addresses.some(privateIp)) throw new Error("Endereço local ou privado bloqueado.");
  const address = addresses[0];
  if (!address) throw new Error("Endereço local ou privado bloqueado.");
  return { url, address };
}

function htmlToText(html: string): string {
  return html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/article|\/section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function readLimitedBody(response: FetchResponse, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("A página excede o limite de leitura.");
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("A página excede o limite de leitura.");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("A página excede o limite de leitura.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function readPage(
  rawUrl: string,
  options: { lookupHost?: Lookup; fetcher?: Fetcher; timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ url: string; title: string; text: string; untrusted: string }> {
  const lookupHost = options.lookupHost ?? (async (host) => (await lookup(host, { all: true })).map((entry) => entry.address));
  const fetcher = options.fetcher ?? pinnedFetch;
  const maxBytes = options.maxBytes ?? PAGE_READ_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PAGE_READ_TIMEOUT_MS);
  try {
    let { url, address } = await validateUrl(rawUrl, lookupHost);
    let response: FetchResponse | undefined;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetcher(url.toString(), { signal: controller.signal, redirect: "manual", address, headers: { "User-Agent": "grupo-jadson-ai/0.1", Accept: "text/html,text/plain;q=0.9" } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Redirecionamento inválido ou excessivo.");
      ({ url, address } = await validateUrl(new URL(location, url).toString(), lookupHost));
    }
    if (!response?.ok) throw new Error(`A página respondeu ${response?.status ?? "sem resposta"}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) throw new Error("Formato da página não é HTML ou texto.");
    const html = await readLimitedBody(response, maxBytes);
    const text = (type.includes("text/plain") ? html : htmlToText(html)).slice(0, PAGE_READ_MAX_TEXT);
    const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
    const cleanTitle = title ? htmlToText(title).slice(0, 300) : url.hostname;
    return { url: url.toString(), title: cleanTitle, text, untrusted: markUntrusted(text, "web page") };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Tempo limite ao ler a página.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
