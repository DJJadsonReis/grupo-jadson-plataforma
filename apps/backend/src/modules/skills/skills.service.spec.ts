import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SkillsService } from "./skills.service";

const valid = { slug: "research", title: "Research", instructions: "Follow these steps" };
const operator = { id: "person-1", name: "Person", role: "operator" as const };
const admin = { id: "admin-1", name: "Admin", role: "admin" as const };

function setup(query = jest.fn()) {
  const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
  return { service: new SkillsService(database), query };
}

describe("SkillsService", () => {
  it("creates a skill owned by the supplied principal", async () => {
    const created = { id: "id", ownerId: "person-1", ...valid, summary: "", tools: ["pagina.ler"], createdAt: new Date(), updatedAt: new Date() };
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [created] }));
    await expect(service.create(operator, { ...valid, tools: ["pagina.ler"] })).resolves.toEqual(created);
    expect(query.mock.calls[0]?.[1]).toEqual([expect.any(String), "person-1", "research", "Research", "", "Follow these steps", false, ["pagina.ler"]]);
  });

  it("stores an empty tools array when tools are omitted", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [{ tools: [] }] }));
    await expect(service.create(operator, valid)).resolves.toMatchObject({ tools: [] });
    expect(query.mock.calls[0]?.[1]?.[7]).toEqual([]);
  });

  it("deduplicates tools before writing", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [{ tools: ["pagina.ler"] }] }));
    await service.create(operator, { ...valid, tools: ["pagina.ler", "pagina.ler"] });
    expect(query.mock.calls[0]?.[1]?.[7]).toEqual(["pagina.ler"]);
  });

  it.each([
    ["non-array", "pagina.ler"],
    ["non-string member", ["pagina.ler", 42]],
    ["more than 20 items", Array(21).fill("pagina.ler")],
    ["unknown tool", ["desconhecida"]],
  ])("rejects %s tools without querying", async (_name, tools) => {
    const { service, query } = setup();
    await expect(service.create(operator, { ...valid, tools })).rejects.toMatchObject({ response: { code: "INVALID_SKILL" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("allows an admin to create a global skill", async () => {
    const created = { id: "id", ownerId: "admin-1", ...valid, summary: "", global: true };
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [created] }));
    await expect(service.create(admin, { ...valid, global: true })).resolves.toMatchObject({ global: true });
    expect(query.mock.calls[0]?.[1]).toEqual([expect.any(String), "admin-1", "research", "Research", "", "Follow these steps", true, []]);
  });

  it("rejects non-admin global creation and invalid global values", async () => {
    const { service, query } = setup();
    await expect(service.create(operator, { ...valid, global: true })).rejects.toMatchObject({
      status: 403, response: { code: "FORBIDDEN", message: "Só administradores criam habilidades globais." },
    });
    await expect(service.create(admin, { ...valid, global: "yes" })).rejects.toMatchObject({ response: { code: "INVALID_SKILL" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a non-admin global request before validating an invalid slug", async () => {
    const { service, query } = setup();
    await expect(service.create(operator, { ...valid, slug: "Invalid slug", global: true })).rejects.toMatchObject({
      status: 403, response: { code: "FORBIDDEN" },
    });
    expect(query).not.toHaveBeenCalled();
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
    await expect(service.create(operator, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("maps duplicate owner-scoped slugs to conflict and permits other owners", async () => {
    const query = jest.fn()
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "other", ownerId: "person-2", ...valid, summary: "" }] });
    const { service } = setup(query);
    await expect(service.create(operator, valid)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...operator, id: "person-2" }, valid)).resolves.toMatchObject({ ownerId: "person-2" });
  });

  it("lists owned and global rows for the supplied principal", async () => {
    const rows = [{ id: "one", ownerId: "person-1" }];
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows }));
    await expect(service.list(operator)).resolves.toEqual(rows);
    expect(query.mock.calls[0]?.[1]).toEqual(["person-1"]);
    expect(query.mock.calls[0]?.[0]).toContain("WHERE owner_id=$1 OR global");
  });

  it("deletes only the owner's slug and reports missing or foreign skills uniformly", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
    const { service } = setup(query);
    await expect(service.remove(operator, "research")).resolves.toBeUndefined();
    const foreign = service.remove({ ...operator, id: "person-2" }, "research");
    const absent = service.remove(operator, "absent");
    await expect(foreign).rejects.toBeInstanceOf(NotFoundException);
    await expect(absent).rejects.toBeInstanceOf(NotFoundException);
    await expect(foreign).rejects.toThrow("Habilidade não encontrada.");
    await expect(absent).rejects.toThrow("Habilidade não encontrada.");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE slug=$1 AND (owner_id=$2 OR (global AND $3))");
    expect(query.mock.calls[0]?.[1]).toEqual(["research", "person-1", false]);
  });

  it("allows an admin to remove a global skill", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rowCount: 1 }));
    await expect(service.remove(admin, "shared")).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[1]).toEqual(["shared", "admin-1", true]);
  });
});
