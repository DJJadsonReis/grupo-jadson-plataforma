import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { join } from "node:path";
import { ApiTokenGuard } from "../auth/api-token.guard";
import { UsersService } from "../auth/users.service";
import { DatabaseService } from "../database/database.service";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";

describe("MCP servers API e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let mcp: McpService;
  const previous = { token: process.env.API_TOKEN, key: process.env.CREDENTIAL_KEY, filesystem: process.env.MCP_FILESYSTEM_DISABLED, servers: process.env.MCP_SERVERS };
  const adminToken = "mcp-e2e-admin-token";
  const secret = "mcp-e2e-secret-known-value";
  const stored: Array<Record<string, unknown>> = [];
  const database = {
    isReady: () => true,
    getPool: () => ({ query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT id,name,command,args,env_secret,enabled FROM mcp_servers WHERE enabled=true")) return { rows: stored.filter((row) => row.enabled) };
      if (sql.includes("SELECT id,name,command,args,enabled,env_secret FROM mcp_servers WHERE id")) return { rows: stored.filter((row) => row.id === values[0]) };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: stored.filter((row) => row.enabled && row.id !== values[0]).length }] };
      if (sql.includes("INSERT INTO mcp_servers")) { stored.push({ id: values[0], name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5], status: "error", status_message: "" }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET name")) { Object.assign(stored.find((row) => row.id === values[0])!, { name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5] }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET status")) { Object.assign(stored.find((row) => row.id === values[0])!, { status: values[1], status_message: values[2] }); return { rows: [] }; }
      if (sql.includes("SELECT id,name,command,args,enabled,status,status_message,env_secret")) return { rows: stored };
      if (sql.includes("SELECT env_secret FROM mcp_servers WHERE name")) return { rows: stored.filter((row) => row.name === values[0]).map((row) => ({ env_secret: row.env_secret })) };
      if (sql.includes("SELECT name FROM mcp_servers WHERE id")) return { rows: stored.filter((row) => row.id === values[0]).map((row) => ({ name: row.name })) };
      if (sql.includes("DELETE FROM mcp_servers")) { const index = stored.findIndex((row) => row.id === values[0]); if (index >= 0) stored.splice(index, 1); return { rows: [] }; }
      return { rows: [] };
    } }),
  };
  const users = {
    findByToken: async (token: string) => token === "operator-token" ? { id: "operator", name: "Operador", role: "operator" as const } : null,
    findBySession: async () => null,
  };

  beforeAll(async () => {
    process.env.API_TOKEN = adminToken;
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.MCP_FILESYSTEM_DISABLED = "true";
    delete process.env.MCP_SERVERS;
    const module = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: DatabaseService, useValue: database },
        McpService,
        { provide: APP_GUARD, useFactory: () => new ApiTokenGuard(new Reflector(), users as unknown as UsersService) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    mcp = app.get(McpService);
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of [["API_TOKEN", previous.token], ["CREDENTIAL_KEY", previous.key], ["MCP_FILESYSTEM_DISABLED", previous.filesystem], ["MCP_SERVERS", previous.servers]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it("cria via API, mascara env, desliga ferramenta e recusa mutações sem papel admin", async () => {
    const created = await fetch(`${baseUrl}/api/v1/mcp/servers`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "fake", command: process.execPath, args: [join(__dirname, "fixtures", "fake-mcp-server.js")], enabled: true, env: { MCP_E2E_SECRET: secret } }) });
    const createdText = await created.text();
    expect(created.status).toBe(200);
    expect(createdText).toContain('"status":"connected"');
    expect(createdText).toContain('"toolCount":1');
    expect(createdText).toContain('"hasEnv":true');
    expect(createdText).not.toContain(secret);
    expect(createdText).not.toContain('"env"');
    expect(mcp.catalog().some((tool) => tool.name === "fake.ping")).toBe(true);
    expect(await mcp.call("fake.ping", {})).toEqual({ conteudo: [{ type: "text", text: "[REDACTED]" }], erro: false });

    const list = await fetch(`${baseUrl}/api/v1/mcp/servers`, { headers: { Authorization: "Bearer operator-token" } });
    const listText = await list.text();
    expect(list.status).toBe(200);
    expect(listText).toContain('"toolCount":1');
    expect(listText).not.toContain(secret);
    const id = String(stored[0]?.id);
    const disabled = await fetch(`${baseUrl}/api/v1/mcp/servers/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) });
    expect(disabled.status).toBe(200);
    expect(await disabled.text()).toContain('"hasEnv":true');
    expect(mcp.find("fake.ping")).toBeUndefined();
    await expect(mcp.call("fake.ping", {})).rejects.toThrow();
    const disabledList = await fetch(`${baseUrl}/api/v1/mcp/servers`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(await disabledList.text()).toContain('"toolCount":0');
    const cleared = await fetch(`${baseUrl}/api/v1/mcp/servers/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ env: {} }) });
    expect(await cleared.text()).toContain('"hasEnv":false');
    const broken = await fetch(`${baseUrl}/api/v1/mcp/servers`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "quebrado", command: "mcp-missing-binary-nope", args: [], enabled: true, env: { MCP_E2E_SECRET: secret } }) });
    const brokenText = await broken.text();
    expect(broken.status).toBe(200);
    expect(brokenText).toContain('"status":"error"');
    expect(brokenText).toContain('"hasEnv":true');
    expect(brokenText).not.toContain(secret);

    for (const [method, url, body] of [
      ["POST", "/api/v1/mcp/servers", { name: "fake", command: "node", args: [], enabled: true }],
      ["PATCH", `/api/v1/mcp/servers/${id}`, { enabled: true }],
      ["DELETE", `/api/v1/mcp/servers/${id}`, undefined],
    ] as const) {
      const response = await fetch(`${baseUrl}${url}`, { method, headers: { Authorization: "Bearer operator-token", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      expect(response.status).toBe(403);
    }
  });
});
