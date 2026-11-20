import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AgentPermissionsService } from "./agent-permissions.service";
import { AgentsService } from "./agents.service";
import { AgentsController } from "./agents.controller";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("permissões de bots no PostgreSQL", () => {
  let database: DatabaseService;
  const owner = { id: randomUUID(), name: "Owner", role: "operator" as const };
  const editor = { id: randomUUID(), name: "Editor", role: "operator" as const };
  const viewer = { id: randomUUID(), name: "Viewer", role: "viewer" as const };
  const admin = { id: randomUUID(), name: "Admin", role: "admin" as const };
  const agentId = randomUUID();
  const service = () => new AgentPermissionsService(database);

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    database = new DatabaseService();
    await database.onModuleInit();
    const pool = database.getPool();
    for (const user of [owner, editor, viewer, admin]) {
      await pool.query("INSERT INTO users(id,name,role,token_hash) VALUES($1,$2,$3,$4)", [user.id, user.name, user.role, `test-${user.id}`]);
    }
    await pool.query("INSERT INTO agents(id,name,owner_id) VALUES($1,$2,$3)", [agentId, `sharing-${agentId}`, owner.id]);
  });

  afterAll(async () => {
    if (database?.isReady()) {
      const pool = database.getPool();
      await pool.query("DELETE FROM agents WHERE id=$1", [agentId]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[owner.id, editor.id, viewer.id, admin.id]]);
    }
    await database?.onModuleDestroy();
  });

  it("applies direct grant, prevents non-owners editing, and revokes on the next check", async () => {
    const permissions = service();
    await permissions.grant(agentId, { userId: editor.id }, "editor", owner);
    await permissions.grant(agentId, { userId: viewer.id }, "user", owner);
    expect(await permissions.access(agentId, editor)).toBe("editor");
    await permissions.assertCanEdit(agentId, editor);
    await expect(permissions.assertCanEdit(agentId, viewer)).rejects.toBeInstanceOf(ForbiddenException);
    await permissions.revoke(agentId, { userId: editor.id }, owner);
    expect(await permissions.access(agentId, editor)).toBe("none");
    await permissions.revoke(agentId, { userId: viewer.id }, owner);
  });

  it("uses the highest direct/team role and removes team access on membership revocation", async () => {
    const permissions = service();
    const team = await permissions.createTeam(`team-${randomUUID()}`, admin);
    await permissions.addTeamMember(team.id, editor.id, admin);
    await permissions.grant(agentId, { teamId: team.id }, "user", owner);
    await permissions.grant(agentId, { userId: editor.id }, "editor", owner);
    expect(await permissions.access(agentId, editor)).toBe("editor");
    await permissions.revoke(agentId, { userId: editor.id }, owner);
    expect(await permissions.access(agentId, editor)).toBe("user");
    await permissions.removeTeamMember(team.id, editor.id, admin);
    expect(await permissions.access(agentId, editor)).toBe("none");
    await permissions.revoke(agentId, { teamId: team.id }, owner);
    await database.getPool().query("DELETE FROM teams WHERE id=$1", [team.id]);
  });

  it("rejects non-admin team membership changes and ignores inactive direct recipients", async () => {
    const permissions = service();
    await expect(permissions.createTeam("not-admin", owner)).rejects.toBeInstanceOf(ForbiddenException);
    await permissions.grant(agentId, { userId: viewer.id }, "user", owner);
    await database.getPool().query("UPDATE users SET active=false WHERE id=$1", [viewer.id]);
    expect(await permissions.access(agentId, viewer)).toBe("none");
    await expect(permissions.grant(agentId, { userId: viewer.id }, "user", owner)).rejects.toThrow("não encontrado");
    expect(await permissions.access(agentId, viewer)).toBe("none");
    await permissions.revoke(agentId, { userId: viewer.id }, owner);
    await database.getPool().query("UPDATE users SET active=true WHERE id=$1", [viewer.id]);
  });

  it("filters the API list and hides profile instructions from a user share", async () => {
    const otherAgentId = randomUUID();
    const pool = database.getPool();
    await pool.query("INSERT INTO agents(id,name,instructions,owner_id) VALUES($1,$2,$3,$4)", [otherAgentId, `api-${otherAgentId}`, "private instructions", owner.id]);
    try {
      const permissions = service();
      await permissions.grant(otherAgentId, { userId: viewer.id }, "user", owner);
      const controller = new AgentsController(new AgentsService(database), permissions);
      const result = await controller.list({ principal: viewer });
      const shared = result.find((agent) => agent.id === otherAgentId);
      expect(shared).toMatchObject({ permission: "user", instructions: "", toolsAllowed: [], generationConfig: {} });
      expect(result.some((agent) => agent.id === agentId)).toBe(false);
    } finally {
      await pool.query("DELETE FROM agents WHERE id=$1", [otherAgentId]);
    }
  });
});
