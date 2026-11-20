import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TeamRoomsService } from "./team-rooms.service";

const person = { id: "11111111-1111-4111-8111-111111111111", name: "Ana", role: "viewer" as const };
const roomId = "22222222-2222-4222-8222-222222222222";
function setup(overrides: Record<string, unknown> = {}) {
  const query = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("count(*)")) return { rows: [{ count: overrides.count ?? (sql.includes("team_room_members") ? 1 : 0) }], rowCount: 1 };
    if (sql.includes("SELECT r.id,r.name,r.created_by")) return { rows: overrides.membership === false ? [] : [{ id: roomId, name: "Sala", created_by: person.id, role: overrides.role ?? "admin" }], rowCount: overrides.membership === false ? 0 : 1 };
    if (sql.includes("SELECT id FROM users")) return { rows: overrides.target === false ? [] : [{ id: person.id }], rowCount: overrides.target === false ? 0 : 1 };
    if (sql.includes("SELECT role FROM team_room_members")) return { rows: [{ role: overrides.targetRole ?? "member" }], rowCount: 1 };
    if (sql.includes("SELECT id,name,description")) return { rows: overrides.bots ?? [], rowCount: (overrides.bots as unknown[] | undefined)?.length ?? 0 };
    if (sql.includes("INSERT INTO team_room_messages")) return { rows: [{ id: "message", roomId, authorKind: "person", authorId: person.id, authorName: person.name, content: "oi", createdAt: new Date() }], rowCount: 1 };
    if (sql.includes("WHERE room_id=$1 AND id=ANY")) return { rows: [{ id: "message", roomId, authorKind: "person", authorId: person.id, authorName: person.name, content: "oi", createdAt: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query: jest.fn(async (sql: string, values?: unknown[]) => query(sql, values ?? [])), release: jest.fn() };
  const pool = { query, connect: jest.fn().mockResolvedValue(client) };
  const stream = jest.fn();
  const permissions = { access: jest.fn().mockResolvedValue("user") };
  const service = new TeamRoomsService({ getPool: () => pool } as never, permissions as never, { stream } as never);
  return { service, query, client, stream, permissions };
}

describe("TeamRoomsService", () => {
  it("rejects invalid names and ids before querying", async () => {
    const { service, query } = setup();
    await expect(service.create(" ", person)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.messages("bad", person)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
  it("hides rooms from nonmembers and enforces role and member limits", async () => {
    const outsider = setup({ membership: false });
    await expect(outsider.service.get(roomId, person)).rejects.toMatchObject({ response: { code: "ROOM_NOT_FOUND" } });
    const viewer = setup({ role: "member" });
    await expect(viewer.service.addMember(roomId, "33333333-3333-4333-8333-333333333333", person)).rejects.toBeInstanceOf(ForbiddenException);
    const limit = setup({ count: 50 });
    await expect(limit.service.addMember(roomId, person.id, person)).rejects.toBeInstanceOf(ConflictException);
  });
  it("saves person messages without calling a provider when no bot is mentioned", async () => {
    const { service, stream, client } = setup();
    const result = await service.send(roomId, "Olá", person);
    expect(result.messages).toHaveLength(1);
    expect(stream).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'person'"), expect.any(Array));
  });
  it("ignores inaccessible bots and does not expose details of unavailable rooms", async () => {
    const { service, stream, permissions } = setup({ bots: [{ id: "33333333-3333-4333-8333-333333333333", name: "Assistente", instructions: "instruções", enabled: true }] });
    permissions.access.mockResolvedValue("none");
    await service.send(roomId, "@Assistente oi", person);
    expect(stream).not.toHaveBeenCalled();
  });
});
