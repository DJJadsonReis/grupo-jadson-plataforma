import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConversationsController } from "./conversations.controller";

describe("ConversationsController.remove", () => {
  it("returns not found for a local non-UUID id without calling the database service", async () => {
    const conversations = { remove: jest.fn() } as any;
    const controller = new ConversationsController(conversations);

    await expect(controller.remove("local-conversation-1", { principal: { id: "owner" } as any })).rejects.toBeInstanceOf(NotFoundException);
    expect(conversations.remove).not.toHaveBeenCalled();
  });

  it("deletes a server conversation for the authenticated owner", async () => {
    const conversations = { remove: jest.fn().mockResolvedValue(true) } as any;
    const controller = new ConversationsController(conversations);

    await expect(controller.remove("123e4567-e89b-42d3-a456-426614174000", { principal: { id: "owner" } as any })).resolves.toEqual({ removed: true });
    expect(conversations.remove).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174000", "owner");
  });

  it("returns not found when the conversation does not exist or belongs to another owner", async () => {
    const conversations = { remove: jest.fn().mockResolvedValue(false) } as any;
    const controller = new ConversationsController(conversations);
    await expect(controller.remove("123e4567-e89b-42d3-a456-426614174000", { principal: { id: "owner" } as any })).rejects.toBeInstanceOf(NotFoundException);
    expect(conversations.remove).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174000", "owner");
  });
});

describe("ConversationsController.operationMode", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("recusa usuário comum sem salvar Ignorar permissões", async () => {
    const conversations = { setOperationMode: jest.fn().mockImplementation(async (_id: string, _owner: string, mode: string, role: string) => {
      if (mode === "ignorar_permissoes" && role !== "admin") throw new ForbiddenException();
      return { mode, inherited: false };
    }) } as any;
    const controller = new ConversationsController(conversations);
    await expect(controller.setOperationMode(id, { mode: "ignorar_permissoes", confirmation: "IGNORAR PERMISSÕES" }, { principal: { id: "user", name: "Pessoa", role: "operator" } as any })).rejects.toBeInstanceOf(ForbiddenException);
    expect(conversations.setOperationMode).toHaveBeenCalledTimes(1);
    expect(conversations.setOperationMode).toHaveBeenCalledWith(id, "user", "ignorar_permissoes", "operator", "Pessoa", "IGNORAR PERMISSÕES");
  });
  it("aceita ativação forte de administrador", async () => {
    const conversations = { setOperationMode: jest.fn().mockResolvedValue({ mode: "ignorar_permissoes", inherited: false }) } as any;
    const controller = new ConversationsController(conversations);
    await expect(controller.setOperationMode(id, { mode: "ignorar_permissoes", confirmation: "IGNORAR PERMISSÕES" }, { principal: { id: "admin", name: "Admin", role: "admin" } as any })).resolves.toMatchObject({ mode: "ignorar_permissoes" });
  });
});

describe("ConversationsController.reasoningEffort", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it.each(["baixo", "medio", "alto", null])("allows owner to save %s", async (effort) => {
    const conversations = { setReasoningEffort: jest.fn().mockResolvedValue({ effort }) } as any;
    const controller = new ConversationsController(conversations);
    await expect(controller.setReasoningEffort(id, { effort }, { principal: { id: "owner" } as any })).resolves.toEqual({ effort });
    expect(conversations.setReasoningEffort).toHaveBeenCalledWith(id, "owner", effort);
  });
  it.each(["extremo", 1, ""]) ("rejects invalid effort without echoing it", (effort) => {
    const controller = new ConversationsController({ setReasoningEffort: jest.fn() } as any);
    try {
      controller.setReasoningEffort(id, { effort }, { principal: { id: "owner" } as any });
      throw new Error("A requisição deveria ter sido recusada.");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, response: { message: "Nível de esforço inválido." } });
    }
  });
  it("reads the owner's saved level", async () => {
    const conversations = { reasoningEffort: jest.fn().mockResolvedValue({ effort: "alto" }) } as any;
    await expect(new ConversationsController(conversations).reasoningEffort(id, { principal: { id: "owner" } as any })).resolves.toEqual({ effort: "alto" });
    expect(conversations.reasoningEffort).toHaveBeenCalledWith(id, "owner");
  });
  it("returns not found when the caller does not own the conversation", async () => {
    const conversations = { setReasoningEffort: jest.fn().mockRejectedValue(new NotFoundException("Conversa não encontrada.")) } as any;
    await expect(new ConversationsController(conversations).setReasoningEffort(id, { effort: "alto" }, { principal: { id: "other-person" } as any })).rejects.toBeInstanceOf(NotFoundException);
    expect(conversations.setReasoningEffort).toHaveBeenCalledWith(id, "other-person", "alto");
  });
});
