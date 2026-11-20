import { TeamRoomsService } from "./team-rooms.service";

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
    const service = new TeamRoomsService({ getPool: () => ({ query, connect: async () => client }) } as never, { access: async () => "user" } as never, { stream } as never);
    await service.send(roomId, "@AnaBot olá", { id: userId, name: "Ana", role: "viewer" });
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: "Bot seguro" })]), tools: [] }));
    const prompt = JSON.stringify(stream.mock.calls[0][0]);
    expect(prompt).not.toMatch(/memória|preferência|skill|conversa privada/i);
    expect(inserted.find((values) => values[2] === botId)?.[4]).not.toContain("sk-12345678901234567890");
  });
});
