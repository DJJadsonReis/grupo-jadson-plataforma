import { BadRequestException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pinnedFetch } from "../tools/page-reader";

export const AGENT_ENDPOINT_FAILED = "Não foi possível obter uma resposta do endpoint do agente.";
export const AGENT_ENDPOINT_TIMEOUT_MS = 30_000;
export const AGENT_ENDPOINT_MAX_BYTES = 64 * 1024;

export function validateAgentEndpoint(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 500) throw new BadRequestException({ code: "INVALID_AGENT_ENDPOINT", message: "Informe uma URL HTTPS válida de até 500 caracteres, sem credenciais." });
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new BadRequestException({ code: "INVALID_AGENT_ENDPOINT", message: "Informe uma URL HTTPS válida de até 500 caracteres, sem credenciais." });
  }
}

export function isPrivateAgentAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || /^fe[89ab]/.test(ip)) return true;
  if (ip.startsWith("::ffff:")) return isPrivateAgentAddress(ip.slice(7));
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0] = ip.split(".").map(Number);
  const c = Number(ip.split(".")[2] ?? 0);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && c === 0 || b === 0 && c === 2 || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113 || a >= 224;
}

async function readLimited(response: globalThis.Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > AGENT_ENDPOINT_MAX_BYTES) throw new Error("oversized");
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > AGENT_ENDPOINT_MAX_BYTES) throw new Error("oversized");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > AGENT_ENDPOINT_MAX_BYTES) { await reader.cancel(); throw new Error("oversized"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function callAgentEndpoint(input: {
  url: string; token?: string | undefined; conversationId?: string | undefined; messages: { role: string; content: string }[]; agent: { id: string; name: string };
  fetcher?: (url: string, init: Parameters<typeof pinnedFetch>[1] & { method: string; body: string }) => Promise<unknown>; lookupHost?: (host: string) => Promise<string[]>; timeoutMs?: number;
}): Promise<string> {
  const url = validateAgentEndpoint(input.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? AGENT_ENDPOINT_TIMEOUT_MS);
  try {
    const target = new URL(url);
    const lookupHost = input.lookupHost ?? (async (host) => (await lookup(host, { all: true })).map((entry) => entry.address));
    const addresses = isIP(target.hostname) ? [target.hostname] : await lookupHost(target.hostname);
    if (!addresses.length || addresses.some(isPrivateAgentAddress)) throw new Error("invalid destination");
    const fetcher = input.fetcher ?? pinnedFetch;
    const response = await fetcher(url, {
      signal: controller.signal, redirect: "manual", address: addresses[0]!, method: "POST", body: JSON.stringify({ conversationId: input.conversationId, messages: input.messages, agent: input.agent }),
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}) },
    }) as globalThis.Response;
    if (response.status !== 200) throw new Error("unexpected status");
    const payload: unknown = JSON.parse(await readLimited(response as unknown as globalThis.Response));
    if (!payload || typeof payload !== "object" || typeof (payload as { reply?: unknown }).reply !== "string" || !(payload as { reply: string }).reply.trim()) throw new Error("invalid reply");
    return (payload as { reply: string }).reply;
  } catch {
    if (controller.signal.aborted) throw new Error(AGENT_ENDPOINT_FAILED);
    throw new Error(AGENT_ENDPOINT_FAILED);
  } finally { clearTimeout(timer); }
}
