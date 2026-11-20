import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pinnedFetch } from "../tools/page-reader";

export const AGENT_ENDPOINT_FAILED = "Não foi possível obter uma resposta do endpoint do agente.";
export const AGENT_ENDPOINT_TIMEOUT_MS = 30_000;
export const AGENT_ENDPOINT_MAX_BYTES = 64 * 1024;
export const AGUI_TOTAL_TIMEOUT_MS = 120_000;
export const AGUI_IDLE_TIMEOUT_MS = 30_000;
export const AGUI_MAX_OUTPUT_BYTES = 256 * 1024;

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

export async function* streamAgUiEndpoint(input: {
  url: string; token?: string; conversationId?: string; messages: { role: string; content: string }[]; agent: { id: string; name: string };
  fetcher?: (url: string, init: Parameters<typeof pinnedFetch>[1] & { method: string; body: string }) => Promise<unknown>;
  lookupHost?: (host: string) => Promise<string[]>; totalTimeoutMs?: number; idleTimeoutMs?: number;
}): AsyncGenerator<string> {
  const url = validateAgentEndpoint(input.url);
  const controller = new AbortController();
  const totalTimer = setTimeout(() => { controller.abort(); void reader?.cancel(); }, input.totalTimeoutMs ?? AGUI_TOTAL_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const target = new URL(url);
    const lookupHost = input.lookupHost ?? (async (host) => (await lookup(host, { all: true })).map((entry) => entry.address));
    const addresses = isIP(target.hostname) ? [target.hostname] : await lookupHost(target.hostname);
    if (!addresses.length || addresses.some(isPrivateAgentAddress)) throw new Error("invalid destination");
    const fetcher = input.fetcher ?? pinnedFetch;
    const response = await fetcher(url, {
      signal: controller.signal, redirect: "manual", address: addresses[0]!, method: "POST",
      body: JSON.stringify({ threadId: input.conversationId ?? randomUUID(), runId: randomUUID(), messages: input.messages.map((message) => ({ id: randomUUID(), role: message.role, content: message.content })), tools: [], context: [], state: {}, forwardedProps: {} }),
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}) },
    }) as globalThis.Response;
    if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") || !response.body) throw new Error("invalid response");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > AGUI_MAX_OUTPUT_BYTES * 8) throw new Error("oversized");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "", eventName = "", data: string[] = [], bytes = 0, outputBytes = 0, finished = false;
    const dispatch = (): string | null => {
      const payload = data.join("\n"); data = []; const name = eventName; eventName = "";
      if (!payload) return null;
      if (name && name !== "TEXT_MESSAGE_CONTENT" && name !== "RUN_ERROR" && name !== "RUN_FINISHED") return null;
      let event: { type?: unknown; delta?: unknown };
      try { event = JSON.parse(payload) as typeof event; } catch { throw new Error("invalid event"); }
      const type = typeof event.type === "string" ? event.type : name;
      if (type === "RUN_ERROR") throw new Error("run failed");
      if (type === "RUN_FINISHED") { finished = true; return null; }
      if (type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
        outputBytes += Buffer.byteLength(event.delta, "utf8");
        if (outputBytes > AGUI_MAX_OUTPUT_BYTES) throw new Error("oversized");
        return event.delta;
      }
      return null;
    };
    const processLine = (line: string): string | null => {
      if (!line) return dispatch();
      if (line.startsWith(":")) return null;
      const colon = line.indexOf(":"); const field = colon < 0 ? line : line.slice(0, colon); const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") eventName = value;
      else if (field === "data") data.push(value);
      return null;
    };
    while (!finished) {
      let idleTimer: NodeJS.Timeout | undefined;
      const read = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { idleTimer = setTimeout(() => { controller.abort(); void reader?.cancel(); reject(new Error("idle timeout")); }, input.idleTimeoutMs ?? AGUI_IDLE_TIMEOUT_MS); }),
      ]).finally(() => { if (idleTimer) clearTimeout(idleTimer); });
      if (read.done) break;
      bytes += read.value.byteLength;
      if (bytes > AGUI_MAX_OUTPUT_BYTES * 8) { await reader.cancel(); throw new Error("oversized"); }
      pending += decoder.decode(read.value, { stream: true });
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      for (const raw of lines) { const delta = processLine(raw.endsWith("\r") ? raw.slice(0, -1) : raw); if (delta !== null) yield delta; if (finished) break; }
    }
    pending += decoder.decode();
    if (!finished) {
      if (pending) { const delta = processLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending); if (delta !== null) yield delta; }
      const delta = processLine(""); if (delta !== null) yield delta;
    }
    if (!finished) throw new Error("missing finish");
  } catch { controller.abort(); await reader?.cancel().catch(() => undefined); throw new Error(AGENT_ENDPOINT_FAILED); }
  finally { clearTimeout(totalTimer); reader?.releaseLock(); }
}
