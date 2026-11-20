import { EventEmitter } from "node:events";
import { ChatController } from "./chat.controller";
import { ConversationsController } from "./conversations.controller";

class StreamResponse extends EventEmitter {
  status() { return this; } setHeader() { return this; } write() { return true; } end() { return this; }
}

describe("fluxo ponta a ponta do esforço por conversa", () => {
  it("salva alto, aplica em modelo compatível, ignora modelo sem suporte e restaura padrão", async () => {
    let effort: "baixo" | "medio" | "alto" | null = null;
    let exists = false;
    const conversations = {
      isPersisted: async () => exists,
      create: async () => { exists = true; },
      setOperationMode: async () => undefined,
      setReasoningEffort: async (_id: string, _owner: string, value: typeof effort) => { effort = value; return { effort }; },
      reasoningEffort: async () => ({ effort }),
      addMessage: async () => undefined,
    };
    const api = new ConversationsController(conversations as never);
    const calls: any[] = [];
    const providers = { stream: async (input: any) => {
      calls.push(input);
      return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    } };
    const controller = new ChatController(
      providers as never, conversations as never,
      { get: async () => null } as never, {} as never, { record: async () => undefined } as never,
      { record: async () => undefined } as never, { contextLines: async () => [] } as never,
      { catalog: () => [], secretsForMasking: async () => [], operationModeForChat: async () => "automatico", invoke: async () => ({}) } as never,
      { assertCanUse: async () => "owner" } as never,
    );
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const principal = { id: "owner", name: "Pessoa", role: "operator" };
    const send = async (model: string) => controller.complete({ conversationId: id, model, messages: [{ role: "user", content: "oi" }] }, { principal: principal as never }, new StreamResponse() as never);

    await api.create({ id, title: "Conversa de teste" }, { principal: principal as never });
    await api.setReasoningEffort(id, { effort: "alto" }, { principal: principal as never });
    await send("o3");
    expect(calls[0]).toMatchObject({ model: "o3", reasoningEffort: "alto" });
    await send("gpt-4.1");
    expect(calls[1]).toMatchObject({ model: "gpt-4.1" });
    expect(calls[1]).not.toHaveProperty("reasoningEffort");
    await api.setReasoningEffort(id, { effort: null }, { principal: principal as never });
    await send("o3");
    expect(calls[2]).toMatchObject({ model: "o3" });
    expect(calls[2]).not.toHaveProperty("reasoningEffort");
  });
});
