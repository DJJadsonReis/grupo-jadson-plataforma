import { ForbiddenException } from "@nestjs/common";
import { AgentsController } from "./agents.controller";

const principal = { id: "person-1", name: "Person", role: "operator" as const };
const bot = (id: string) => ({
  id, ownerId: "owner", name: "Bot", description: "", instructions: "private prompt", model: "model",
  enabled: true, avatar: "", role: "", department: "", specialties: [], provider: "openai",
  generationConfig: { temperature: 0.5 }, toolsAllowed: ["read"],
});

function setup() {
  const agents = {
    list: jest.fn(async () => [bot("visible"), bot("hidden")]),
    create: jest.fn(async (input, ownerId) => ({ ...bot(input.id ?? "created"), ownerId })),
    update: jest.fn(async () => bot("visible")),
    remove: jest.fn(async () => true),
  };
  const permissions = {
    listAccessible: jest.fn(async () => [{ id: "visible", access: "user" as const }]),
    assertCanEdit: jest.fn(async () => undefined),
    assertCanDelete: jest.fn(async () => undefined),
    listShares: jest.fn(async () => []),
    grant: jest.fn(async () => undefined),
    revoke: jest.fn(async () => undefined),
  };
  return { controller: new AgentsController(agents as never, permissions as never), agents, permissions };
}

describe("AgentsController access rules", () => {
  it("filters inaccessible bots and omits private profile fields from user shares", async () => {
    const { controller } = setup();
    const result = await controller.list({ principal });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ permission: "user", instructions: "", toolsAllowed: [], generationConfig: {} });
    expect(result[0]?.instructions).not.toBe("private prompt");
  });

  it("assigns the authenticated principal as owner, ignoring a client ownerId", async () => {
    const { controller, agents } = setup();
    await controller.create({ name: "New", ownerId: "victim", id: "123e4567-e89b-42d3-a456-426614174000" }, { principal });
    expect(agents.create).toHaveBeenCalledWith(expect.objectContaining({ id: "123e4567-e89b-42d3-a456-426614174000", name: "New" }), "person-1");
  });

  it("checks edit permission before mutation and lets the owner grant a role", async () => {
    const { controller, agents, permissions } = setup();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    permissions.assertCanEdit.mockRejectedValueOnce(new ForbiddenException());
    await expect(controller.update(id, { name: "changed" }, { principal })).rejects.toBeInstanceOf(ForbiddenException);
    expect(agents.update).not.toHaveBeenCalled();
    await controller.grant(id, { userId: "123e4567-e89b-42d3-a456-426614174001", role: "editor" }, { principal });
    expect(permissions.grant).toHaveBeenCalledWith(id, { userId: "123e4567-e89b-42d3-a456-426614174001" }, "editor", principal);
  });
});
