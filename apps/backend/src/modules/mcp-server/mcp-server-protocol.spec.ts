import { handleJsonRpc } from "./mcp-server-protocol";
import { MCP_TOOL_DEFINITIONS } from "./mcp-server-tools";

describe("protocolo MCP do Grupo Jadson", () => {
  const call = jest.fn(async (name: string, args: Record<string, unknown>) => ({ name, args }));
  const deps = { tools: { definitions: () => MCP_TOOL_DEFINITIONS, call, readAgentResource: async (uri: string) => ({ uri }), resources: async () => [{ uri: "agente://1" }] } };
  beforeEach(() => call.mockClear());

  it("inicializa capacidades, lista as ferramentas declaradas e responde ping", async () => {
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps)).resolves.toMatchObject({ result: { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "grupo-jadson" } } });
    const tools = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps) as { result: { tools: Array<{ name: string }> } };
    expect(tools.result.tools.map((tool) => tool.name)).toEqual(["plataforma_status", "tarefas_listar", "tarefas_criar", "memoria_listar", "memoria_lembrar", "agentes_listar", "rotinas_listar", "notificacoes_listar"]);
    expect(tools.result.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining(["apagar", "conversar", "rotina_criar"]));
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 3, method: "ping" }, deps)).resolves.toMatchObject({ result: {} });
  });

  it("despacha resources, prompts e tools/call", async () => {
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "resources/list" }, deps)).resolves.toMatchObject({ result: { resources: [{ uri: "agente://1" }] } });
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "agente://1" } }, deps)).resolves.toMatchObject({ result: { contents: [{ uri: "agente://1" }] } });
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 3, method: "prompts/list" }, deps)).resolves.toMatchObject({ result: { prompts: [{ title: "Resumir minhas tarefas abertas" }, { title: "Criar tarefa a partir de um texto" }] } });
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "resumir_tarefas_abertas" } }, deps)).resolves.toMatchObject({ result: { messages: [{ content: { type: "text" } }] } });
    await handleJsonRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "tarefas_listar", arguments: { owner: "ignored" } } }, deps);
    expect(call).toHaveBeenCalledWith("tarefas_listar", { owner: "ignored" });
  });

  it("trata JSON inválido, método desconhecido e notificações", async () => {
    await expect(handleJsonRpc("{", deps)).resolves.toMatchObject({ error: { code: -32700 } });
    await expect(handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "missing" }, deps)).resolves.toMatchObject({ error: { code: -32601 } });
    await expect(handleJsonRpc({ jsonrpc: "2.0", method: "ping" }, deps)).resolves.toBeNull();
  });
});
