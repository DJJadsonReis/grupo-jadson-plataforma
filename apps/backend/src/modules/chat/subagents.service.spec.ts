import { runSubagent, SUBAGENT_APPROVAL_MESSAGE } from "./subagents.service";
import { isMarkedUntrusted } from "../tools/untrusted-content";
import { ToolDefinition } from "../tools/tools.registry";

const readTool: ToolDefinition = { name: "notion.buscar", description: "Pesquisa no Notion", risk: "read", parameters: { properties: { consulta: { type: "string", description: "Consulta" } }, required: ["consulta"] } };

describe("runSubagent", () => {
  it("envia somente instruções e tarefa, sem delegação recursiva, e devolve resposta marcada", async () => {
    const calls: any[] = [];
    const result = await runSubagent({ task: "leia", bot: { instructions: "regras" }, grantedTools: [readTool, { ...readTool, name: "subagente.delegar" }], runTurn: async (input) => { calls.push(input); return { content: "resultado", toolCalls: [] }; } });
    expect(calls[0].messages).toEqual(expect.arrayContaining([{ role: "system", content: "regras" }, { role: "user", content: "leia" }]));
    expect(JSON.stringify(calls[0].messages)).not.toContain("mensagem original");
    expect(calls[0].tools.map((tool: any) => tool.function.name)).toEqual(["notion__buscar"]);
    expect(isMarkedUntrusted(result.texto, "subagente")).toBe(true);
  });

  it("recusa tarefa vazia ou longa sem chamar modelo", async () => {
    const runTurn = jest.fn();
    for (const task of [" ", "x".repeat(2001)]) await runSubagent({ task, bot: {}, grantedTools: [], runTurn });
    expect(runTurn).not.toHaveBeenCalled();
  });

  it("não executa ferramentas sensíveis nem permite recursão", async () => {
    const invokeTool = jest.fn();
    const runTurn = jest.fn().mockResolvedValueOnce({ content: "", toolCalls: [
      { id: "1", type: "function", function: { name: "memoria__apagar_tudo", arguments: "{}" } },
      { id: "2", type: "function", function: { name: "subagente__delegar", arguments: "{}" } },
    ] }).mockResolvedValueOnce({ content: "fim", toolCalls: [] });
    const result = await runSubagent({ task: "leia", bot: {}, grantedTools: [{ name: "memoria.apagar_tudo", description: "apaga", risk: "sensitive" }], runTurn, limits: { invokeTool, mask: (text) => text } });
    expect(invokeTool).not.toHaveBeenCalled();
    expect(runTurn.mock.calls[1][0].messages.at(-2).content).toBe(SUBAGENT_APPROVAL_MESSAGE);
    expect(JSON.stringify(runTurn.mock.calls[1][0].messages)).toContain("Ferramenta indisponível.");
  });

  it("encerra após quatro ciclos, mascara e corta saída acima de 4000 caracteres", async () => {
    const runTurn = jest.fn().mockResolvedValue({ content: "", toolCalls: [{ id: "1", type: "function", function: { name: "notion__buscar", arguments: "{}" } }] });
    const bounded = await runSubagent({ task: "leia", bot: {}, grantedTools: [readTool], runTurn, limits: { invokeTool: async () => ({}), mask: (text) => text } });
    expect(runTurn).toHaveBeenCalledTimes(5);
    expect(bounded.texto).toContain("limite de 4 ciclos");
    const long = await runSubagent({ task: "leia", bot: {}, grantedTools: [], runTurn: async () => ({ content: "x".repeat(4100), toolCalls: [] }), limits: { mask: (text) => text } });
    expect(long.truncado).toBe(true);
    expect(long.texto.length).toBeGreaterThan(4000); // envelope de conteúdo não confiável envolve os 4000 caracteres.
  });
});
