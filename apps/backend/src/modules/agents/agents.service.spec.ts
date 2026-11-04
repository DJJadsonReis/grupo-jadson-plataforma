import { DatabaseService } from "../database/database.service";
import { AgentsService } from "./agents.service";

describe("AgentsService local UUID persistence", () => {
  const profile = { id: "d1eb7e27-ff37-46d2-b88e-71a52c451736", name: "Researcher", description: "", instructions: "", model: "", enabled: true };

  it("uses a supplied UUID when inserting a desktop profile", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [profile] });
    const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
    const result = await new AgentsService(database).create(profile);

    expect(result).toEqual(profile);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT(id) DO NOTHING"), [profile.id, profile.name, profile.description, profile.instructions, profile.model, profile.enabled, "", "", "", [], "openai", {}, []]);
  });

  it("returns an existing row without overwriting it when the UUID is already present", async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [profile] });
    const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
    const result = await new AgentsService(database).create({ ...profile, name: "Local copy" });

    expect(result).toEqual(profile);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("SELECT id,name,description");
  });
});
