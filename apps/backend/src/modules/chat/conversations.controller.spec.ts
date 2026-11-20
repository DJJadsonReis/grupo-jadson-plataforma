import { NotFoundException } from "@nestjs/common";
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
