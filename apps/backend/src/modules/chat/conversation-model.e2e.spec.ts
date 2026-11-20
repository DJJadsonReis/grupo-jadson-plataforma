import { ConversationsController } from "./conversations.controller";
import { ChatController } from "./chat.controller";
import { EventEmitter } from "node:events";
import { TOOL_DEFINITIONS } from "../tools/tools.registry";

class StreamResponse extends EventEmitter {
  writes: Uint8Array[] = [];
  status() { return this; }
  setHeader() { return this; }
  write(chunk: Uint8Array) { this.writes.push(chunk); return true; }
  end() { return this; }
}

describe("fluxo da escolha de modelo por conversa", () => {
  it("grava uma escolha, permite leitura e retorna ao padrão sem apagar histórico", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const providerId = "123e4567-e89b-42d3-a456-426614174010";
    let stored: { providerId: string; model: string } | null = null;
    const conversations = {
      setModelChoice: jest.fn(async (_id: string, _owner: string, choice: typeof stored) => { stored = choice; return choice ?? { providerId: null, model: null }; }),
      modelChoice: jest.fn(async () => stored ?? { providerId: null, model: null }),
    };
    const api = new ConversationsController(conversations as never, { validateManagedModel: jest.fn(async () => undefined) } as never);
    const request = { principal: { id: "owner" } as never };
    await api.setModelChoice(id, { providerId, model: "o3" }, request);
    await expect(api.modelChoice(id, request)).resolves.toEqual({ providerId, model: "o3" });
    await api.setModelChoice(id, { providerId: null, model: null }, request);
    await expect(api.modelChoice(id, request)).resolves.toEqual({ providerId: null, model: null });
  });

  it("salva via PUT, aplica no chat, recua quando indisponível e volta ao padrão", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const agentId = "123e4567-e89b-42d3-a456-426614174001";
    const agentProvider = "123e4567-e89b-42d3-a456-426614174002";
    const chosenProvider = "123e4567-e89b-42d3-a456-426614174003";
    let stored: { providerId: string; model: string } | null = null;
    let unavailable = false;
    const conversationApi = {
      isPersisted: async () => true,
      create: async () => undefined,
      modelChoice: async () => stored,
      setModelChoice: async (_id: string, _owner: string, choice: typeof stored) => { stored = choice; return choice; },
      reasoningEffort: async () => ({ effort: null }),
      addMessage: async () => undefined,
      operationMode: async () => ({ mode: "automatico", inherited: false }),
    };
    const providers = {
      validateManagedProvider: async () => undefined,
      validateManagedModel: async (providerId: string) => { if (unavailable && providerId === chosenProvider) throw new Error("unavailable"); },
      stream: jest.fn(async (input: { providerId?: string; model?: string }) => {
        calls.push({ ...(input.providerId ? { providerId: input.providerId } : {}), ...(input.model ? { model: input.model } : {}) });
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
      }),
      modelSupportsEffort: async () => false,
    };
    const calls: { providerId?: string; model?: string }[] = [];
    const agents = { get: async (value: string) => value === agentId ? { id: agentId, instructions: "", enabled: true, model: "agent-model", provider: agentProvider, generationConfig: null, modelRouting: { fallbacks: [] } } : null };
    const controller = new ChatController(providers as never, conversationApi as never, agents as never, { get: async () => null } as never, { record: async () => undefined } as never, { record: async () => undefined } as never, { contextLines: async () => [] } as never, { catalog: () => TOOL_DEFINITIONS, secretsForMasking: async () => [], policies: { decisionFor: async () => null }, operationModeForChat: async () => "automatico" } as never, { assertCanUse: async () => "owner" } as never);
    const api = new ConversationsController(conversationApi as never, providers as never);
    const principal = { principal: { id: "owner", name: "Pessoa", role: "operator" } as never };
    await api.setModelChoice(id, { providerId: chosenProvider, model: "o3" }, principal);
    expect(stored).toEqual({ providerId: chosenProvider, model: "o3" });
    await controller.complete({ conversationId: id, agentId, messages: [{ role: "user", content: "oi" }] }, principal, new StreamResponse() as never);
    expect(calls.at(-1)).toEqual({ providerId: chosenProvider, model: "o3" });
    unavailable = true;
    await controller.complete({ conversationId: id, agentId, messages: [{ role: "user", content: "de novo" }] }, principal, new StreamResponse() as never);
    expect(calls.at(-1)).toMatchObject({ providerId: agentProvider, model: "agent-model" });
    expect(stored).toEqual({ providerId: chosenProvider, model: "o3" });
    await api.setModelChoice(id, { providerId: null, model: null }, principal);
    await controller.complete({ conversationId: id, agentId, messages: [{ role: "user", content: "padrão" }] }, principal, new StreamResponse() as never);
    expect(calls.at(-1)).toMatchObject({ providerId: agentProvider, model: "agent-model" });
    expect(stored).toBeNull();
  });
});
