export interface JsonRpcRequest { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
export interface McpProtocolDeps {
  tools: { definitions(): readonly unknown[]; call(name: string, args: Record<string, unknown>): Promise<unknown>; readAgentResource(uri: string): Promise<unknown | null>; resources?(): Promise<unknown[]>; invalidCall?(): Promise<void> };
}
const PROMPTS = [
  { name: "resumir_tarefas_abertas", title: "Resumir minhas tarefas abertas", description: "Organize suas tarefas abertas em um resumo claro." },
  { name: "criar_tarefa_de_texto", title: "Criar tarefa a partir de um texto", description: "Transforme um texto em uma tarefa objetiva." },
];

export async function handleJsonRpc(message: unknown, deps: McpProtocolDeps): Promise<unknown | null> {
  let request: JsonRpcRequest;
  try { request = typeof message === "string" ? JSON.parse(message) as JsonRpcRequest : message as JsonRpcRequest; }
  catch { return rpcError(null, -32700, "Erro ao analisar JSON."); }
  if (!request || typeof request !== "object" || Array.isArray(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(request?.id ?? null, -32600, "Requisição inválida.");
  }
  const notification = !Object.prototype.hasOwnProperty.call(request, "id");
  const id = request.id ?? null;
  const params = request.params && typeof request.params === "object" && !Array.isArray(request.params) ? request.params as Record<string, unknown> : {};
  const respond = (result: unknown) => notification ? null : { jsonrpc: "2.0", id, result };
  if (request.method === "notifications/initialized" || request.method === "notifications/cancelled") return null;
  if (notification && request.method !== "tools/call") return null;
  try {
    switch (request.method) {
      case "initialize": return respond({ protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "grupo-jadson", version: "0.1.0" } });
      case "ping": return respond({});
      case "tools/list": return respond({ tools: deps.tools.definitions() });
      case "tools/call": {
        const name = params.name;
        if (typeof name !== "string") {
          await deps.tools.invalidCall?.();
          return rpcError(id, -32602, "Parâmetros inválidos.");
        }
        const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
        try { return respond({ content: [{ type: "text", text: JSON.stringify(await deps.tools.call(name, args)) }], isError: false }); }
        catch (error) {
          return respond({ content: [{ type: "text", text: "Não foi possível executar a ferramenta." }], isError: true });
        }
      }
      case "resources/list": return respond({ resources: await deps.tools.resources?.() ?? [] });
      case "resources/read": {
        if (typeof params.uri !== "string") return rpcError(id, -32602, "Parâmetros inválidos.");
        const resource = await deps.tools.readAgentResource(params.uri);
        if (resource === null) return rpcError(id, -32602, "Recurso não encontrado.");
        return respond({ contents: [{ uri: params.uri, mimeType: "application/json", text: JSON.stringify(resource) }] });
      }
      case "prompts/list": return respond({ prompts: PROMPTS });
      case "prompts/get": {
        const name = params.name;
        if (typeof name !== "string") return rpcError(id, -32602, "Parâmetros inválidos.");
        if (name === "resumir_tarefas_abertas") return respond({ description: PROMPTS[0]!.description, messages: [{ role: "user", content: { type: "text", text: "Consulte minhas tarefas abertas com tarefas_listar e apresente um resumo curto, agrupado por prioridade e próximo passo." } }] });
        if (name === "criar_tarefa_de_texto") return respond({ description: PROMPTS[1]!.description, messages: [{ role: "user", content: { type: "text", text: "Leia o texto que vou fornecer, extraia uma ação concreta e crie uma tarefa usando tarefas_criar. Se faltar um título claro, pergunte antes." } }] });
        return rpcError(id, -32602, "Prompt não encontrado.");
      }
      default: return rpcError(id, -32601, "Método não encontrado.");
    }
  } catch { return rpcError(id, -32603, "Erro interno."); }
}

export function jsonRpcParseError(): unknown { return rpcError(null, -32700, "Erro ao analisar JSON."); }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }
