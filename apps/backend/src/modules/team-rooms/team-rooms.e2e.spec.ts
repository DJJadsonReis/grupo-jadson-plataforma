import { TeamRoomsService } from "./team-rooms.service";
import { AuditController } from "../audit/audit.controller";
import { AuditService } from "../audit/audit.service";

describe("team rooms end-to-end behavior with fakes", () => {
  it("does not forward memory, preferences, skills, private conversations, or tools to room bots", async () => {
    const botId = "33333333-3333-4333-8333-333333333333";
    const userId = "11111111-1111-4111-8111-111111111111";
    const roomId = "22222222-2222-4222-8222-222222222222";
    const inserted: unknown[][] = [];
    const bot = { id: botId, name: "AnaBot", instructions: "Bot seguro", model: "m", provider: "openai", generationConfig: {}, enabled: true };
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT r.id,r.name,r.created_by")) return { rows: [{ id: roomId, name: "Sala", created_by: userId, role: "admin" }], rowCount: 1 };
      if (sql.includes("SELECT id,name,description")) return { rows: [bot], rowCount: 1 };
      if (sql.includes("SELECT author_kind,author_name,content")) return { rows: [{ author_kind: "person", author_name: "Ana", content: "@AnaBot olá" }], rowCount: 1 };
      if (sql.includes("INSERT INTO team_room_messages")) { inserted.push(values); return { rows: [{ id: "msg", roomId, authorKind: "person", authorId: userId, authorName: "Ana", content: "@AnaBot olá", createdAt: new Date() }], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    });
    const client = { query: (sql: string, values: unknown[]) => query(sql, values), release: jest.fn() };
    const stream = jest.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "resposta sk-12345678901234567890" } }] })}\n\ndata: [DONE]\n\n`));
    const service = new TeamRoomsService({ getPool: () => ({ query, connect: async () => client }) } as never, { access: async () => "user" } as never, { stream } as never, { record: async () => undefined } as never);
    await service.send(roomId, "@AnaBot olá", { id: userId, name: "Ana", role: "viewer" });
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: "Bot seguro" })]), tools: [] }));
    const prompt = JSON.stringify(stream.mock.calls[0][0]);
    expect(prompt).not.toMatch(/memória|preferência|skill|conversa privada/i);
    expect(inserted.find((values) => values[2] === botId)?.[4]).not.toContain("sk-12345678901234567890");
  });

  it("audits room lifecycle and exposes filtered events without room message content", async () => {
    const actor = { id: "11111111-1111-4111-8111-111111111111", name: "Ana", role: "admin" as const };
    const roomId = "22222222-2222-4222-8222-222222222222";
    const memberId = "33333333-3333-4333-8333-333333333333";
    const events: Array<{ id: string; actor: string; action: string; subject: string | null; details: Record<string, unknown>; createdAt: string }> = [];
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes("INSERT INTO audit_events")) {
          events.push({ id: String(values[0]), actor: String(values[1]), action: String(values[2]), subject: values[3] as string | null, details: JSON.parse(String(values[4])) as Record<string, unknown>, createdAt: new Date().toISOString() });
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("SELECT id, actor, action, subject, details")) {
          const action = sql.includes("action = $1") ? String(values[0]) : undefined;
          return { rows: events.filter((event) => !action || event.action === action).slice(0, Number(values.at(-1))).map(({ ...event }) => event), rowCount: events.length };
        }
        if (sql.includes("count(*)") && sql.includes("team_rooms")) return { rows: [{ count: 0 }], rowCount: 1 };
        if (sql.includes("SELECT r.id,r.name,r.created_by")) return { rows: [{ id: roomId, name: "Equipe", created_by: actor.id, created_at: new Date(), archived: false, role: "admin" }], rowCount: 1 };
        if (sql.includes("SELECT id FROM users")) return { rows: [{ id: memberId }], rowCount: 1 };
        if (sql.includes("SELECT 1 FROM team_room_members")) return { rows: [], rowCount: 0 };
        if (sql.includes("SELECT role FROM team_room_members")) return { rows: [{ role: "member" }], rowCount: 1 };
        if (sql.includes("DELETE FROM team_room_members")) return { rows: [{ person_id: memberId }], rowCount: 1 };
        if (sql.includes("INSERT INTO team_room_members") && sql.includes("RETURNING person_id")) return { rows: [{ person_id: memberId }], rowCount: 1 };
        if (sql.includes("SELECT m.person_id AS")) return { rows: [], rowCount: 0 };
        if (sql.includes("SELECT count(*)") && sql.includes("team_room_members")) return { rows: [{ count: 1 }], rowCount: 1 };
        if (sql.includes("SELECT id,room_id AS")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
    const pool = {
      query,
      connect: jest.fn(async () => ({
        query: jest.fn(async (sql: string, values: unknown[] = []) => {
          if (sql.includes("INSERT INTO team_rooms")) return { rows: [{ id: roomId, name: "Equipe", createdBy: actor.id, createdAt: new Date(), archived: false }], rowCount: 1 };
          if (sql.includes("INSERT INTO team_room_messages")) return { rows: [{ id: "message-id", roomId, authorKind: "person", authorId: actor.id, authorName: actor.name, content: "segredo da conversa", createdAt: new Date() }], rowCount: 1 };
          if (sql.includes("WHERE room_id=$1 AND id=ANY")) return { rows: [{ id: "message-id", roomId, authorKind: "person", authorId: actor.id, authorName: actor.name, content: "segredo da conversa", createdAt: new Date() }], rowCount: 1 };
          return query(sql, values);
        }), release: jest.fn(),
      })),
    };
    const audit = new AuditService({ getPool: () => pool } as never);
    const service = new TeamRoomsService({ getPool: () => pool } as never, { access: async () => "none" } as never, { stream: jest.fn() } as never, audit);
    await service.create("Equipe", actor);
    await service.addMember(roomId, memberId, actor);
    await service.removeMember(roomId, memberId, actor);
    await service.send(roomId, "segredo da conversa", actor);

    const controller = new AuditController(audit);
    const filtered = await controller.events({ action: "team.room.member_added" }, { principal: actor });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({ actor: actor.id, action: "team.room.member_added", subject: roomId, details: { roomId, personId: memberId, role: "member" } });
    expect(events).toHaveLength(3);
    expect(events.map(({ action }) => action)).toEqual(["team.room.created", "team.room.member_added", "team.room.member_removed"]);
    expect(JSON.stringify(events)).not.toContain("segredo da conversa");
  });
});
