export type McpTransport = "stdio" | "http";
export type McpServerDraft = { name: string; transport: McpTransport; command: string; argsText: string; url: string; headers: Record<string, string>; env: Record<string, string>; enabled: boolean };
export type McpServerPayload = { name: string; transport: McpTransport; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string>; enabled: boolean };
export type McpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function validateMcpUrl(value: string): URL {
  if (typeof value !== "string" || value.length > 2000) throw new Error("Informe uma URL MCP válida.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Informe uma URL MCP válida."); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(host)))) throw new Error("A URL deve usar HTTPS; HTTP só é permitido em localhost.");
  if (host.startsWith("169.254.") || host === "fd00:ec2::" || host.startsWith("fd00:ec2:")) throw new Error("O host da URL não é permitido.");
  return url;
}

function validateHeaders(headers: Record<string, string>): void {
  const forbidden = new Set(["host", "content-length", "cookie"]);
  if (Object.keys(headers).length > 10) throw new Error("Informe até 10 cabeçalhos HTTP válidos.");
  for (const [name, value] of Object.entries(headers)) if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || forbidden.has(name.toLowerCase()) || value.length > 2000 || /[\r\n]/.test(value)) throw new Error("Informe até 10 cabeçalhos HTTP válidos.");
}

export function buildMcpServerPayload(draft: McpServerDraft): McpServerPayload {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(draft.name) || draft.name === "arquivos") throw new Error("Use um nome válido em letras minúsculas.");
  if (draft.transport === "http") {
    validateMcpUrl(draft.url);
    validateHeaders(draft.headers);
    const headers = Object.fromEntries(Object.entries(draft.headers).filter(([key, value]) => key.trim() && value.length));
    return { name: draft.name, transport: "http", url: draft.url.trim(), enabled: draft.enabled, ...(Object.keys(headers).length ? { headers } : {}) };
  }
  const command = draft.command.trim();
  if (!command || (command.includes(" ") && !/^(?:[A-Za-z]:\\|\/)/.test(command))) throw new Error("O comando deve ser um nome simples ou caminho absoluto, sem espaços.");
  const args = draft.argsText.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean);
  if (args.length > 20 || args.some((arg) => arg.length > 200)) throw new Error("Use até 20 argumentos com no máximo 200 caracteres cada.");
  const env = Object.fromEntries(Object.entries(draft.env).filter(([, value]) => value.length > 0));
  if (Object.keys(env).length > 20) throw new Error("Use até 20 variáveis de ambiente.");
  return { name: draft.name, transport: "stdio", command, args, enabled: draft.enabled, ...(Object.keys(env).length ? { env } : {}) };
}

export async function saveMcpServer(fetcher: McpFetch, url: string, draft: McpServerDraft, id?: string): Promise<Response> {
  const payload = buildMcpServerPayload(draft);
  return fetcher(id ? `${url}/${id}` : url, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function listMcpServers(fetcher: McpFetch, url: string): Promise<unknown[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("Não foi possível carregar servidores MCP.");
  const rows = await response.json() as Record<string, unknown>[];
  return rows.map(({ env: _env, headers: _headers, headers_secret: _headersSecret, ...server }) => server);
}
