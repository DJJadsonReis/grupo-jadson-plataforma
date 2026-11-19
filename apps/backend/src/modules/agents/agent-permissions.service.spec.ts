import { DatabaseService } from "../database/database.service";
import { AgentPermissionsService } from "./agent-permissions.service";

describe("AgentPermissionsService", () => {
  it("returns the access role computed by PostgreSQL", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ owner_id: "owner-1", shared_role: "editor" }] });
    const service = new AgentPermissionsService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    await expect(service.access("agent-id", { id: "editor-1", name: "Editor", role: "operator" })).resolves.toBe("editor");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("agent_shares"), ["agent-id", "editor-1"]);
  });

  it("keeps legacy system bots usable and reserves management for global admins", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ owner_id: "sistema", shared_role: "none" }] });
    const service = new AgentPermissionsService({ getPool: () => ({ query }) } as unknown as DatabaseService);
    await expect(service.access("legacy", { id: "person", name: "Person", role: "operator" })).resolves.toBe("user");
    await expect(service.access("legacy", { id: "sistema", name: "System", role: "admin" })).resolves.toBe("owner");
  });
});
