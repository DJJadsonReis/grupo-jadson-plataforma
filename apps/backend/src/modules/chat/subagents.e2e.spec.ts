import { ChatController } from "./chat.controller";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";
import { withUntrustedNotice } from "../tools/untrusted-content";
import { EventEmitter } from "node:events";
import { Response } from "express";

function response(events: unknown[]): globalThis.Response {
  return new globalThis.Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
}
function call(name: string, args: Record<string, unknown>) {
  return { choices: [{ delta: { tool_calls: [{ index: 0, id: "delegar-1", type: "function", function: { name: name.replace(/\./g, "__"), arguments: JSON.stringify(args) } }] } }] };
}
class FakeResponse extends EventEmitter {
  writes: Uint8Array[] = [];
  status() { return this; } setHeader() { return this; } write(value: Uint8Array) { this.writes.push(value); return true; } end() {}
}

describe("subagentes ponta a ponta", () => {
  it("delega, usa ferramenta de leitura, devolve resultado ao bot e grava auditoria sem conteúdo", async () => {
    const db: { audit: Record<string, unknown>[]; messages: unknown[] } = { audit: [], messages: [] };
    const audit = { record: async (event: Record<string, unknown>) => { db.audit.push(event); } };
    const streams = [
      response([call("subagente.delegar", { tarefa: "pesquise uma página" })]),
      response([call("notion.buscar", { consulta: "teste" })]),
      response([{ choices: [{ delta: { content: "resultado do Notion" } }] }]),
      response([{ choices: [{ delta: { content: "resposta final do bot" } }] }]),
    ];
    const inputs: any[] = [];
    const provider = { stream: async (input: any) => { inputs.push(input); return streams.shift()!; } };
    const invoke = jest.fn(async () => ({ status: "done", output: withUntrustedNotice({ resultados: ["página encontrada"] }, "notion.buscar") }));
    const tools = { catalog: () => [...TOOL_DEFINITIONS, { name: "notion.buscar", description: "Pesquisa no Notion", risk: "read" as const, parameters: { properties: { consulta: { type: "string" as const, description: "consulta" } }, required: ["consulta"] } }], secretsForMasking: async () => [], maskSecretText: async (text: string) => text, policies: { decisionFor: async () => null }, invoke };
    const controller = new ChatController(provider as never, { create: async () => undefined, addMessage: async (...args: unknown[]) => { db.messages.push(args); }, setTitleForFirstResponse: async () => undefined } as never,
      { get: async () => ({ id: "123e4567-e89b-42d3-a456-426614174000", instructions: "instruções", enabled: true, model: null, providerKind: "model", provider: "openai", generationConfig: null }) } as never,
      {} as never, audit as never, {} as never, { contextLines: async () => [] } as never, tools as never, { assertCanUse: async () => "owner" } as never);
    (controller as any).audit = audit;
    const output = new FakeResponse();
    await controller.complete({ agentId: "123e4567-e89b-42d3-a456-426614174000", conversationId: "123e4567-e89b-42d3-a456-426614174001", messages: [{ role: "user", content: "pedido confidencial" }] }, { principal: { id: "pessoa-1", name: "Operador", role: "operator" } }, output as unknown as Response);
    expect(invoke).toHaveBeenCalledWith("notion.buscar", { consulta: "teste", conversationId: "123e4567-e89b-42d3-a456-426614174001" }, "Operador", "123e4567-e89b-42d3-a456-426614174000", "pessoa-1");
    expect(inputs[1].messages.at(-1)).toMatchObject({ role: "user", content: "pesquise uma página" });
    expect(inputs[2].messages.find((message: any) => message.role === "tool").content).toContain("página encontrada");
    expect(inputs[3].messages.find((message: any) => message.role === "tool").content).toContain("resultado do Notion");
    expect(output.writes.map((chunk) => new TextDecoder().decode(chunk)).join("")).toContain("resposta final do bot");
    const event = db.audit.find((item) => item.action === "subagent.run");
    expect(event?.details).toMatchObject({ depth: 1, toolsUsed: 1 });
    expect(JSON.stringify(db.audit)).not.toContain("pedido confidencial");
    expect(JSON.stringify(db.audit)).not.toContain("pesquise uma página");
    expect(JSON.stringify(db.audit)).not.toContain("resultado do Notion");
    expect(db.messages.some((args) => JSON.stringify(args).includes("resposta final do bot"))).toBe(true);
  });
});
