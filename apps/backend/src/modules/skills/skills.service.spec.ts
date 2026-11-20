import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SkillsService } from "./skills.service";

const valid = { slug: "research", title: "Research", instructions: "Follow these steps" };

function setup(query = jest.fn()) {
  const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
  return { service: new SkillsService(database), query };
}

describe("SkillsService", () => {
  it("creates a skill owned by the supplied principal", async () => {
    const created = { id: "id", ownerId: "person-1", ...valid, summary: "", createdAt: new Date(), updatedAt: new Date() };
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [created] }));
    await expect(service.create("person-1", valid)).resolves.toEqual(created);
    expect(query.mock.calls[0]?.[1]).toEqual([expect.any(String), "person-1", "research", "Research", "", "Follow these steps"]);
  });

  it.each([
    ["uppercase slug", { ...valid, slug: "Research" }],
    ["slug with space", { ...valid, slug: "re search" }],
    ["leading hyphen", { ...valid, slug: "-research" }],
    ["trailing hyphen", { ...valid, slug: "research-" }],
    ["long slug", { ...valid, slug: `a${"b".repeat(40)}` }],
    ["empty title", { ...valid, title: "   " }],
    ["empty instructions", { ...valid, instructions: "  " }],
    ["long instructions", { ...valid, instructions: "x".repeat(20_001) }],
    ["non-string summary", { ...valid, summary: 42 }],
  ])("rejects %s before database write", async (_name, input) => {
    const { service, query } = setup();
    await expect(service.create("person-1", input)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("maps duplicate owner-scoped slugs to conflict and permits other owners", async () => {
    const query = jest.fn()
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "other", ownerId: "person-2", ...valid, summary: "" }] });
    const { service } = setup(query);
    await expect(service.create("person-1", valid)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create("person-2", valid)).resolves.toMatchObject({ ownerId: "person-2" });
  });

  it("lists only rows for the supplied owner", async () => {
    const rows = [{ id: "one", ownerId: "person-1" }];
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows }));
    await expect(service.list("person-1")).resolves.toEqual(rows);
    expect(query.mock.calls[0]?.[1]).toEqual(["person-1"]);
    expect(query.mock.calls[0]?.[0]).toContain("WHERE owner_id=$1");
  });

  it("deletes only the owner's slug and reports missing or foreign skills uniformly", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
    const { service } = setup(query);
    await expect(service.remove("person-1", "research")).resolves.toBeUndefined();
    const foreign = service.remove("person-2", "research");
    const absent = service.remove("person-1", "absent");
    await expect(foreign).rejects.toBeInstanceOf(NotFoundException);
    await expect(absent).rejects.toBeInstanceOf(NotFoundException);
    await expect(foreign).rejects.toThrow("Habilidade não encontrada.");
    await expect(absent).rejects.toThrow("Habilidade não encontrada.");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE owner_id=$1 AND slug=$2");
  });
});
