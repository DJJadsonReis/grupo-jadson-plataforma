import { EventEmitter } from "node:events";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatController } from "../chat/chat.controller";
import { HandoffsController } from "./handoffs.controller";
import { HandoffsService } from "./handoffs.service";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";

class StreamResponse extends EventEmitter {
  status() { return this; } setHeader() { return this; } write() { return true; } end() { return this; }
}

describe("handoff de ponta a ponta", () => {
  it("injeta o contexto uma vez no próximo turno e confere dono e permissão", async () => {
    const owner = { id: "owner", name: "Pessoa", role: "operator" as const };
    let pending = "Contexto da delegação\nuser: contexto anterior";
    const captured: string[] = [];
    const handoffs = { consumeContext: jest.fn(async () => { const value = pending; pending = ""; return value || null; }) };
    const providers = { validateManagedProvider: async () => undefined, validateManagedModel: async () => undefined,
      stream: async (input: { messages: Array<{ role: string; content: string }> }) => { captured.push(input.messages.map((item) => item.content).join("\n")); return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n"); }, modelSupportsEffort: async () => false };
    const history = { isPersisted: async () => true, create: async () => undefined, modelChoice: async () => null, addMessage: async () => undefined, reasoningEffort: async () => ({ effort: null }), operationMode: async () => ({ mode: "automatico", inherited: true }) };
    const agent = { id: "agent", name: "Destino", enabled: true, instructions: "", model: "test", provider: "openai", modelRouting: { fallbacks: [] } };
    const controller = new ChatController(providers as never, history as never, { get: async () => agent } as never,
      { get: async () => null } as never, { record: async () => undefined } as never, { record: async () => undefined } as never,
      { contextLines: async () => [] } as never, { catalog: () => TOOL_DEFINITIONS, secretsForMasking: async () => [], policies: { decisionFor: async () => null }, operationModeForChat: async () => "automatico" } as never,
      { assertCanUse: async () => "owner" } as never, undefined, undefined, undefined, handoffs as never);
    const request = { principal: owner } as never;
    const send = async (text: string) => controller.complete({ conversationId: "123e4567-e89b-42d3-a456-426614174000", agentId: "123e4567-e89b-42d3-a456-426614174001", messages: [{ role: "user", content: text }] }, request, new StreamResponse() as never);
    await send("primeiro"); await send("segundo");
    expect(captured[0]).toContain("Contexto da delegação");
    expect(captured[1]).not.toContain("Contexto da delegação");
    const service = new HandoffsService({ getPool: () => ({ query: async (sql: string) => ({ rowCount: sql.includes("conversations") ? 0 : 1, rows: [{ depth: 0 }] }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) }) } as never,
      { get: async () => agent } as never, { record: async () => undefined } as never,
      { assertCanUse: async () => { throw new NotFoundException(); } } as never);
    const api = new HandoffsController(service);
    await expect(api.create({ conversationId: "x", toAgentId: "x" }, { principal: owner })).rejects.toBeInstanceOf(NotFoundException);
    await expect(api.list("x", { principal: owner })).rejects.toBeInstanceOf(NotFoundException);
    const deniedService = new HandoffsService({ getPool: () => ({ query: async (sql: string) => ({ rowCount: sql.includes("conversations") ? 1 : 1, rows: [{ depth: 0 }] }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) }) } as never,
      { get: async () => agent } as never, { record: async () => undefined } as never,
      { assertCanUse: async () => { throw new NotFoundException(); } } as never);
    const deniedApi = new HandoffsController(deniedService);
    await expect(deniedApi.create({ conversationId: "x", toAgentId: "x" }, { principal: owner })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.consumeContext).toBeDefined();
  });
});
