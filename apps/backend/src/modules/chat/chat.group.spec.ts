import { EventEmitter } from "node:events";
import { Response } from "express";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ChatController } from "./chat.controller";

const agentOneId = "d1eb7e27-ff37-46d2-b88e-71a52c451736";
const agentTwoId = "e4fdf3b0-8e4a-4c83-8bb4-6211be769e91";
const groupId = "f114b48a-9560-4ff5-8596-6716ea8b8b77";
const conversationId = "e2dbefac-c277-4c01-9d23-1cb753a5b712";

class FakeResponse extends EventEmitter {
  writes: Uint8Array[] = [];
  status() { return this; }
  setHeader() { return this; }
  write(value: Uint8Array) { this.writes.push(value); return true; }
  end() { return this; }
}

function modelResponse(text = "Resposta do bot") {
  return new globalThis.Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
}

function setup(mode: "mention" | "manual" | "coordinated" = "mention", options: { disabled?: string; secondAgent?: boolean } = {}) {
  const agents = [
    { id: agentOneId, name: "Pesquisador", enabled: options.disabled !== agentOneId },
    ...(options.secondAgent ? [{ id: agentTwoId, name: "Designer", enabled: options.disabled !== agentTwoId }] : []),
  ];
  const group = { id: groupId, name: "Equipe", agentIds: [agentOneId, ...(options.secondAgent ? [agentTwoId] : [])], mode, archived: false };
  const history = {
    create: jest.fn(async () => undefined),
    addMessage: jest.fn(async () => undefined),
    setTitleForFirstResponse: jest.fn(async () => undefined),
  };
  const providers = { stream: jest.fn(async () => modelResponse()) };
  const controller = new ChatController(
    providers as never,
    history as never,
    { get: jest.fn(async (id: string) => {
      const agent = agents.find((item) => item.id === id);
      return agent ? { ...agent, instructions: "", model: null, generationConfig: null, provider: "openai" } : null;
    }) } as never,
    { get: jest.fn(async () => group) } as never,
    { record: jest.fn(async () => undefined) } as never,
    { record: jest.fn(async () => undefined) } as never,
    { contextLines: jest.fn(async () => []) } as never,
    { catalog: () => [], secretsForMasking: async () => [], maskSecretText: async (text: string) => text } as never,
    { assertCanUse: jest.fn(async () => "owner") } as never,
  );
  const response = new FakeResponse();
  const send = (text: string, requestedAgentId?: string) => controller.complete({
    conversationId, groupId, ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
    messages: [{ role: "user", content: text }],
  }, { principal: { id: "pessoa-1", name: "Jadson", role: "operator" } }, response as unknown as Response);
  return { send, response, providers, history, agents };
}

describe("ChatController em conversas de grupo", () => {
  it("roteia por menção e grava usuário e resposta com o agente correto", async () => {
    const { send, response, providers, history } = setup("mention");
    await send("@Pesquisador investigue");
    expect(providers.stream).toHaveBeenCalled();
    expect(history.create).toHaveBeenCalledWith(conversationId, "@Pesquisador investigue", agentOneId, groupId, "pessoa-1");
    expect(history.addMessage).toHaveBeenNthCalledWith(1, conversationId, "user", "@Pesquisador investigue", expect.objectContaining({ agentId: agentOneId, mentions: [{ agentId: agentOneId, agentName: "Pesquisador", start: 0, end: 12 }] }), "pessoa-1");
    expect(history.addMessage).toHaveBeenNthCalledWith(2, conversationId, "assistant", "Resposta do bot", { agentId: agentOneId }, "pessoa-1");
    expect(new TextDecoder().decode(response.writes[0])).toContain('"agentId":"' + agentOneId + '"');
    expect(new TextDecoder().decode(response.writes[0])).toContain('"agentName":"Pesquisador"');
  });

  it("responde no modo manual com o agente selecionado", async () => {
    const { send, history, providers } = setup("manual", { secondAgent: true });
    await send("sem menção", agentTwoId);
    expect(providers.stream).toHaveBeenCalled();
    expect(history.create).toHaveBeenCalledWith(conversationId, "sem menção", agentTwoId, groupId, "pessoa-1");
    expect(history.addMessage).toHaveBeenLastCalledWith(conversationId, "assistant", "Resposta do bot", { agentId: agentTwoId }, "pessoa-1");
  });

  it.each([
    ["menção ausente", "olá", undefined, "mention", {}],
    ["duas menções diferentes", "@Pesquisador e @Designer", undefined, "mention", { secondAgent: true }],
    ["agente manual ausente", "olá", undefined, "manual", {}],
    ["agente manual fora do grupo", "olá", agentTwoId, "manual", {}],
    ["agente manual inativo", "olá", agentOneId, "manual", { disabled: agentOneId }],
  ] as const)("recusa %s antes de chamar o modelo ou persistir", async (_label, text, requestedId, mode, options) => {
    const { send, providers, history } = setup(mode, options);
    await expect(send(text, requestedId)).rejects.toBeInstanceOf(BadRequestException);
    expect(providers.stream).not.toHaveBeenCalled();
    expect(history.create).not.toHaveBeenCalled();
    expect(history.addMessage).not.toHaveBeenCalled();
  });

  it("retorna 503 coordenado sem persistência nem chamada ao modelo", async () => {
    const { send, providers, history } = setup("coordinated");
    await expect(send("olá")).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(providers.stream).not.toHaveBeenCalled();
    expect(history.create).not.toHaveBeenCalled();
    expect(history.addMessage).not.toHaveBeenCalled();
  });
});
