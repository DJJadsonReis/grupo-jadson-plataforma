import { EventEmitter } from "node:events";
import { Response } from "express";
import { ForbiddenException } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";
import { AgentsController } from "../agents/agents.controller";

class StreamResponse extends EventEmitter {
  writes: Uint8Array[] = [];
  status() { return this; }
  setHeader() { return this; }
  write(chunk: Uint8Array) { this.writes.push(chunk); return true; }
  end() { return this; }
}

describe("AG-UI endpoint chat e2e", () => {
  it("nega alteração de protocolo a quem não pode editar e não grava", async () => {
    const update = jest.fn();
    const controller = new AgentsController({ update } as never, { assertCanEdit: async () => { throw new ForbiddenException(); } } as never);
    await expect(controller.update("123e4567-e89b-42d3-a456-426614174000", { endpointProtocol: "agui" }, { principal: { id: "person", name: "Pessoa", role: "operator" } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it("streams SSE deltas in order, masks secrets, and stores one complete assistant answer", async () => {
    const secret = "private-secret-123";
    const deltas = ["primeiro ", secret, " último"];
    const sse = deltas.map((delta) => `event: TEXT_MESSAGE_CONTENT\ndata: ${JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", delta })}\n\n`).join("") + "event: RUN_FINISHED\ndata: {\"type\":\"RUN_FINISHED\"}\n\n";
    const fetcher = jest.fn(async () => new globalThis.Response(new ReadableStream({ start(controller) { for (const part of [sse.slice(0, 35), sse.slice(35, 88), sse.slice(88)]) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } }));
    const stored: string[] = [];
    const history = { isPersisted: async () => false, create: async () => undefined, addMessage: async (_id: string, role: string, content: string) => { if (role === "assistant") stored.push(content); }, setTitleForFirstResponse: async () => undefined };
    const agent = { id: "123e4567-e89b-42d3-a456-426614174000", name: "Bot", enabled: true, providerKind: "endpoint", instructions: "", model: "", provider: "", generationConfig: {}, modelRouting: { fallbacks: [] } };
    const agents = { get: async () => agent, endpointCredentials: async () => ({ url: "https://agent.example/run", endpointProtocol: "agui" as const }) };
    const tools = { catalog: () => TOOL_DEFINITIONS, secretsForMasking: async () => [secret], policies: { decisionFor: async () => null }, operationModeForChat: async () => "automatico" };
    const controller = new ChatController({} as never, history as never, agents as never, {} as never, { record: async () => undefined } as never, { record: async () => undefined } as never, { contextLines: async () => [] } as never, tools as never, { assertCanUse: async () => "owner" } as never);
    (controller as unknown as { endpointFetcher: typeof fetcher }).endpointFetcher = fetcher;
    (controller as unknown as { endpointLookup: () => Promise<string[]> }).endpointLookup = async () => ["93.184.216.34"];
    const response = new StreamResponse();
    await controller.complete({ agentId: agent.id, conversationId: "123e4567-e89b-42d3-a456-426614174001", messages: [{ role: "user", content: "oi" }] }, { principal: { id: "person", name: "Pessoa", role: "operator" } }, response as unknown as Response);
    const body = response.writes.map((chunk) => new TextDecoder().decode(chunk)).join("");
    expect(body.indexOf("primeiro ")).toBeLessThan(body.indexOf("[REDACTED]"));
    expect(body.indexOf("[REDACTED]")).toBeLessThan(body.indexOf("último"));
    expect(body).not.toContain(secret);
    expect(stored).toEqual(["primeiro [REDACTED] último"]);
  });

  it("em falha no meio envia erro seguro, grava mensagem de falha e termina SSE", async () => {
    const sse = "event: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"delta\":\"parcial\"}\n\nevent: RUN_ERROR\ndata: {\"type\":\"RUN_ERROR\"}\n\n";
    const fetcher = jest.fn(async () => new globalThis.Response(sse, { headers: { "content-type": "text/event-stream" } }));
    const stored: string[] = [];
    const history = { isPersisted: async () => false, create: async () => undefined, addMessage: async (_id: string, role: string, content: string) => { if (role === "assistant") stored.push(content); }, setTitleForFirstResponse: async () => undefined };
    const agent = { id: "123e4567-e89b-42d3-a456-426614174000", name: "Bot", enabled: true, providerKind: "endpoint", instructions: "", model: "", provider: "", generationConfig: {}, modelRouting: { fallbacks: [] } };
    const agents = { get: async () => agent, endpointCredentials: async () => ({ url: "https://agent.example/run", endpointProtocol: "agui" as const }) };
    const tools = { catalog: () => TOOL_DEFINITIONS, secretsForMasking: async () => [], policies: { decisionFor: async () => null }, operationModeForChat: async () => "automatico" };
    const controller = new ChatController({} as never, history as never, agents as never, {} as never, { record: async () => undefined } as never, { record: async () => undefined } as never, { contextLines: async () => [] } as never, tools as never, { assertCanUse: async () => "owner" } as never);
    (controller as unknown as { endpointFetcher: typeof fetcher }).endpointFetcher = fetcher;
    (controller as unknown as { endpointLookup: () => Promise<string[]> }).endpointLookup = async () => ["93.184.216.34"];
    const response = new StreamResponse();
    await controller.complete({ agentId: agent.id, conversationId: "123e4567-e89b-42d3-a456-426614174001", messages: [{ role: "user", content: "oi" }] }, { principal: { id: "person", name: "Pessoa", role: "operator" } }, response as unknown as Response);
    const body = response.writes.map((chunk) => new TextDecoder().decode(chunk)).join("");
    expect(body).toContain("AGENT_ENDPOINT_FAILED");
    expect(body).toContain("data: [DONE]");
    expect(stored).toEqual(["Não foi possível obter uma resposta do endpoint do agente."]);
  });
});
