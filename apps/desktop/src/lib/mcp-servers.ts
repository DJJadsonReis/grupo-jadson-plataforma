export type McpServerDraft = { name: string; command: string; argsText: string; env: Record<string, string>; enabled: boolean };
export type McpServerPayload = { name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean };
export type McpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function buildMcpServerPayload(draft: McpServerDraft): McpServerPayload {
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(draft.name) || draft.name === "arquivos") throw new Error("Use um nome válido em letras minúsculas.");
  const command = draft.command.trim();
  if (!command || (command.includes(" ") && !/^(?:[A-Za-z]:\\|\/)/.test(command))) throw new Error("O comando deve ser um nome simples ou caminho absoluto, sem espaços.");
  const args = draft.argsText.split(/\r?\n/).map((arg) => arg.trim()).filter(Boolean);
  if (args.length > 20 || args.some((arg) => arg.length > 200)) throw new Error("Use até 20 argumentos com no máximo 200 caracteres cada.");
  const env = Object.fromEntries(Object.entries(draft.env).filter(([, value]) => value.length > 0));
  if (Object.keys(env).length > 20) throw new Error("Use até 20 variáveis de ambiente.");
  return { name: draft.name, command, args, enabled: draft.enabled, ...(Object.keys(env).length ? { env } : {}) };
}

export async function saveMcpServer(fetcher: McpFetch, url: string, draft: McpServerDraft, id?: string): Promise<Response> {
  const payload = buildMcpServerPayload(draft);
  return fetcher(id ? `${url}/${id}` : url, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function listMcpServers(fetcher: McpFetch, url: string): Promise<unknown[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error("Não foi possível carregar servidores MCP.");
  const rows = await response.json() as Record<string, unknown>[];
  return rows.map(({ env: _env, ...server }) => server);
}
