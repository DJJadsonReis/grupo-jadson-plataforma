import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { json } from "express";
import { mcpServerBodyParserError } from "./mcp-server.controller";
import { DatabaseService } from "../database/database.service";
import { AuditService } from "../audit/audit.service";
import { TasksService } from "../tasks/tasks.service";
import { MemoryService } from "../memory/memory.service";
import { AgentsService } from "../agents/agents.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { RoutinesService } from "../routines/routines.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RedisService } from "../redis/redis.service";
import { QueueService } from "../queue/queue.service";
import { McpServerController } from "./mcp-server.controller";
import { McpServerTokensService } from "./mcp-server-tokens.service";
import { McpServerTools } from "./mcp-server-tools";

describe("mcp-server.e2e — tokens pessoais, ferramentas e revogação", () => {
  let app: INestApplication;
  let baseUrl: string;
  const tokenRows: Array<{ id: string; ownerId: string; name: string; hash: string; revokedAt: string | null; createdAt: string; lastUsedAt: string | null }> = [];
  const users = new Map<string, { name: string; role: "admin" | "operator" | "viewer"; active: boolean }>([["person-a", { name: "Pessoa A", role: "admin", active: true }], ["person-b", { name: "Pessoa B", role: "viewer", active: true }]]);
  const tasks: Array<{ ownerId: string; title: string }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const db = { getPool: () => ({ query: async (sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO mcp_server_tokens")) {
      const row = { id: String(values[0]), ownerId: String(values[1]), name: String(values[2]), hash: String(values[3]), revokedAt: null, createdAt: new Date().toISOString(), lastUsedAt: null };
      tokenRows.push(row); return { rows: [{ id: row.id, name: row.name, createdAt: row.createdAt, lastUsedAt: null, revokedAt: null }], rowCount: 1 };
    }
    if (sql.includes("UPDATE mcp_server_tokens t SET last_used_at")) {
      const row = tokenRows.find((entry) => entry.hash === values[0] && !entry.revokedAt);
      const user = row ? users.get(row.ownerId) : undefined;
      if (!row || !user?.active) return { rows: [], rowCount: 0 };
      row.lastUsedAt = new Date().toISOString();
      return { rows: [{ ownerId: row.ownerId, tokenId: row.id, name: user.name, role: user.role }], rowCount: 1 };
    }
    if (sql.includes("SELECT id,name,created_at")) return { rows: tokenRows.filter((row) => row.ownerId === values[0]).map(({ id, name, createdAt, lastUsedAt, revokedAt }) => ({ id, name, createdAt, lastUsedAt, revokedAt })) };
    if (sql.includes("UPDATE mcp_server_tokens SET revoked_at")) {
      const row = tokenRows.find((entry) => entry.id === values[0] && entry.ownerId === values[1]);
      if (!row) return { rows: [], rowCount: 0 };
      row.revokedAt = row.revokedAt ?? new Date().toISOString(); return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO tasks")) {
      const row = { id: String(values[0]), ownerId: String(values[1]), title: String(values[2]), description: String(values[3]), status: "aberta", createdAt: new Date(), updatedAt: new Date() };
      tasks.push({ ownerId: row.ownerId, title: row.title }); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("FROM tasks WHERE owner_id=$1")) return { rows: tasks.filter((task) => task.ownerId === values[0]).map((task) => ({ id: "row-id", ...task, description: "", status: "aberta", createdAt: new Date(), updatedAt: new Date() })), rowCount: tasks.filter((task) => task.ownerId === values[0]).length };
    return { rows: [], rowCount: 0 };
  } }), checkConnection: async () => true, isVectorReady: () => true };
  const toolDefinitions = ["plataforma_status", "tarefas_listar", "tarefas_criar", "memoria_listar", "memoria_lembrar", "agentes_listar", "rotinas_listar", "notificacoes_listar"].map((name) => ({ name, description: name, inputSchema: { type: "object" } }));
  const memory = { isEnabled: async () => true, list: async () => [], remember: async () => ({}) };
  const agentService = { list: async () => [], get: async (id: string) => ({ id, name: id, description: "", instructions: "" }) };
  const permissions = { listAccessible: jest.fn(async (principal: { role: string }) => principal.role === "admin" ? [{ id: "agent-system", access: "owner" as const }] : [{ id: "agent-shared", access: "user" as const }]), access: jest.fn(async (_id: string, principal: { role: string }) => principal.role === "admin" ? "owner" : "user") };
  const routines = { list: async () => [] };
  const notifications = { listUnread: async () => [] };
  const redis = { checkConnection: async () => false };
  const queue = { getDriver: () => "process-memory" };
  const audit = { record: async (event: Record<string, unknown>) => { auditEvents.push(event); } };

  beforeAll(async () => {
    tokenRows.length = 0; tasks.length = 0; auditEvents.length = 0;
    const module = await Test.createTestingModule({
      controllers: [McpServerController],
      providers: [
        McpServerTokensService,
        TasksService,
        McpServerTools,
        { provide: MemoryService, useValue: memory },
        { provide: AgentsService, useValue: agentService },
        { provide: AgentPermissionsService, useValue: permissions },
        { provide: RoutinesService, useValue: routines },
        { provide: NotificationsService, useValue: notifications },
        { provide: RedisService, useValue: redis },
        { provide: QueueService, useValue: queue },
        { provide: AuditService, useValue: audit },
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.use(json({ limit: "8mb" }));
    app.setGlobalPrefix("api/v1");
    app.use(mcpServerBodyParserError);
    app.use((request: import("express").Request, _response: import("express").Response, next: import("express").NextFunction) => {
      const authorization = request.headers.authorization ?? "";
      const session = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (session === "session-a" || session === "session-b") {
        const userId = session === 'session-a' ? 'person-a' : 'person-b';
        const user = users.get(userId)!;
        (request as import('express').Request & { principal?: { id: string; name: string; role: 'admin' | 'operator' | 'viewer' } }).principal = { id: userId, name: user.name, role: user.role };
      }
      next();
    });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}/api/v1/mcp-server`;
  });
  afterAll(async () => { await app.close(); });

  it("execute o fluxo completo isolando tarefas por pessoa e revogando o token", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const create = async (name: string, session: string) => fetch(`${baseUrl}/tokens`, { method: "POST", headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const responseA = await create("Cliente A", "session-a");
    const createdA = await responseA.json() as { token: string; record: { id: string } };
    expect(tokenRows.find((row) => row.id === createdA.record.id)?.hash).not.toBe(createdA.token);
    const listedA = await fetch(`${baseUrl}/tokens`, { headers: { Authorization: "Bearer session-a" } });
    const listText = await listedA.text();
    expect(listText).not.toContain(createdA.token);
    expect(listText).not.toContain("token_hash");
    const responseB = await create("Cliente B", "session-b");
    const createdB = await responseB.json() as { token: string; record: { id: string } };

    const rpc = (token: string, id: number, method: string, params?: unknown) => fetch(baseUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }) });
    users.set("person-a", { name: "Pessoa A", role: "admin", active: false });
    expect((await rpc(createdA.token, 100, "initialize")).status).toBe(401);
    users.set("person-a", { name: "Pessoa A", role: "admin", active: true });
    const initialize = await rpc(createdA.token, 1, "initialize");
    expect(initialize.status).toBe(200);
    expect(await initialize.text()).not.toContain(createdA.token);
    await rpc(createdA.token, 11, "resources/list");
    await rpc(createdA.token, 12, "resources/read", { uri: "agente://agent-system" });
    await rpc(createdB.token, 13, "resources/list");
    await rpc(createdB.token, 14, "resources/read", { uri: "agente://agent-shared" });
    expect(permissions.listAccessible).toHaveBeenCalledWith(expect.objectContaining({ id: "person-a", name: "Pessoa A", role: "admin" }));
    expect(permissions.listAccessible).toHaveBeenCalledWith(expect.objectContaining({ id: "person-b", name: "Pessoa B", role: "viewer" }));
    expect(permissions.access).toHaveBeenCalledWith("agent-system", expect.objectContaining({ role: "admin" }));
    expect(permissions.access).toHaveBeenCalledWith("agent-shared", expect.objectContaining({ role: "viewer" }));
    const toolList = await (await rpc(createdA.token, 2, "tools/list")).json() as { result: { tools: Array<{ name: string }> } };
    expect(toolList.result.tools.map((tool) => tool.name)).toEqual(toolDefinitions.map((tool) => tool.name));
    expect(await (await rpc(createdA.token, 3, "tools/call", { name: "tarefas_criar", arguments: { title: "Tarefa reservada da pessoa A" } })).json()).toMatchObject({ result: { isError: false } });
    expect(await (await rpc(createdA.token, 4, "tools/call", { name: "tarefas_listar", arguments: {} })).json()).toMatchObject({ result: { content: [{ text: expect.stringContaining("Tarefa reservada da pessoa A") }] } });
    expect(await (await rpc(createdB.token, 5, "tools/call", { name: "tarefas_listar", arguments: {} })).json()).toMatchObject({ result: { content: [{ text: "[]" }] } });
    const failedToolResponse = await rpc(createdA.token, 6, "tools/call", { name: "tarefas_criar", arguments: { title: "" } });
    const failedToolText = await failedToolResponse.text();
    expect(failedToolText).not.toContain(createdA.token);
    expect(failedToolText).toContain('"isError":true');
    const notification = await fetch(baseUrl, { method: "POST", headers: { Authorization: `Bearer ${createdA.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(notification.status).toBe(202);
    const tooLarge = await fetch(baseUrl, { method: "POST", headers: { Authorization: `Bearer ${createdA.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "tarefas_criar", arguments: { title: "x".repeat(66_000) } } }) });
    expect(tooLarge.status).toBe(413);
    const malformed = await fetch(baseUrl, { method: "POST", headers: { Authorization: `Bearer ${createdA.token}`, "Content-Type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: -32700 } });

    const revoked = await fetch(`${baseUrl}/tokens/${createdA.record.id}`, { method: "DELETE", headers: { Authorization: "Bearer session-a" } });
    expect(revoked.status).toBe(200);
    expect((await rpc(createdA.token, 6, "initialize")).status).toBe(401);
    expect(auditEvents).toHaveLength(4);
    expect(auditEvents.map((event) => event.action)).toEqual(["mcp.call", "mcp.call", "mcp.call", "mcp.call"]);
    expect(JSON.stringify(auditEvents)).not.toContain(createdA.token);
    expect(JSON.stringify(auditEvents)).not.toContain("Tarefa reservada da pessoa A");
    expect(`${JSON.stringify(logSpy.mock.calls)}${JSON.stringify(warnSpy.mock.calls)}${JSON.stringify(errorSpy.mock.calls)}`).not.toContain(createdA.token);
    expect(tokenRows.find((row) => row.id === createdA.record.id)?.revokedAt).not.toBeNull();
    jest.restoreAllMocks();
  });
});
