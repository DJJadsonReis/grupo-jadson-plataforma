import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ToolsService } from "../tools/tools.service";
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
  let remoteServer: ReturnType<typeof createServer> | undefined;
  let remoteUrl = "";
  let receivedHeader = "";
  let httpTransport: StreamableHTTPServerTransport | undefined;
  let sseTransport: SSEServerTransport | undefined;
  const approvalRequests: unknown[] = [];
  let toolInvocation: ToolsService;
  const database = {
    isReady: () => true,
    getPool: () => ({ query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT id,name,command,args,env_secret,enabled,transport,url,headers_secret FROM mcp_servers WHERE enabled=true")) return { rows: stored.filter((row) => row.enabled) };
      if (sql.includes("SELECT id,name,command,args,enabled,env_secret,transport,url,headers_secret FROM mcp_servers WHERE id")) return { rows: stored.filter((row) => row.id === values[0]) };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: stored.filter((row) => row.enabled && row.id !== values[0]).length }] };
      if (sql.includes("INSERT INTO mcp_servers")) { stored.push({ id: values[0], name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5], transport: values[6], url: values[7], headers_secret: values[8], status: "error", status_message: "" }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET name")) { Object.assign(stored.find((row) => row.id === values[0])!, { name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5], transport: values[6], url: values[7], headers_secret: values[8] }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET status")) { Object.assign(stored.find((row) => row.id === values[0])!, { status: values[1], status_message: values[2] }); return { rows: [] }; }
      if (sql.includes("SELECT id,name,command,args,enabled,status,status_message,env_secret,transport,url,headers_secret")) return { rows: stored };
      if (sql.includes("SELECT env_secret,headers_secret FROM mcp_servers WHERE name")) return { rows: stored.filter((row) => row.name === values[0]).map((row) => ({ env_secret: row.env_secret, headers_secret: row.headers_secret })) };
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
        { provide: ToolsService, useValue: { catalog: () => mcp.catalog().map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk })), invoke: async (name: string, input: Record<string, unknown>) => { const tool = mcp.find(name)!; if (tool.risk === "sensitive") { approvalRequests.push(name); return { status: "pending_approval", tool: name }; } return mcp.call(name, input); } } },
        McpService,
        { provide: APP_GUARD, useFactory: () => new ApiTokenGuard(new Reflector(), users as unknown as UsersService) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    mcp = app.get(McpService);
    toolInvocation = app.get(ToolsService);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => remoteServer ? remoteServer.close(() => resolve()) : resolve());
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

  it("conecta Streamable HTTP local, cifra cabeçalho e mascara resposta; mantém a política read/sensitive", async () => {
    const server = new McpServer({ name: "fake-http", version: "1" }, { capabilities: { tools: {} } });
    server.registerTool("read", { description: "leitura", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "read-result" }] }));
    server.registerTool("change", { description: "mutação", inputSchema: {} }, async () => ({ content: [{ type: "text", text: secret }] }));
    remoteServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      receivedHeader = String(req.headers.authorization ?? "");
      if (!httpTransport) { httpTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => "test-session" }); await server.connect(httpTransport); }
      await httpTransport.handleRequest(req, res);
    });
    await new Promise<void>((resolve) => remoteServer!.listen(0, "127.0.0.1", resolve));
    const address = remoteServer.address();
    if (!address || typeof address === "string") throw new Error("Servidor local indisponível.");
    remoteUrl = `http://127.0.0.1:${address.port}/mcp`;
    const response = await fetch(`${baseUrl}/api/v1/mcp/servers`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "remoto", transport: "http", url: remoteUrl, headers: { Authorization: `Bearer ${secret}` }, enabled: true }) });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain(secret);
    expect(text).toContain('"transport":"http"');
    expect(text).toContain('"hasHeaders":true');
    expect(stored.find((row) => row.name === "remoto")?.headers_secret).not.toContain(secret);
    expect(String(stored.find((row) => row.name === "remoto")?.headers_secret)).toMatch(/^v1:/);
    expect(mcp.catalog()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "remoto.read", risk: "read" }), expect.objectContaining({ name: "remoto.change", risk: "sensitive" })]));
    expect(await mcp.call("remoto.read", {})).toEqual({ conteudo: [{ type: "text", text: "read-result" }], erro: false });
    expect(await toolInvocation.invoke("remoto.read", {}, "tester")).toEqual({ conteudo: [{ type: "text", text: "read-result" }], erro: false });
    expect(await toolInvocation.invoke("remoto.change", {}, "tester")).toEqual({ status: "pending_approval", tool: "remoto.change" });
    expect(approvalRequests).toEqual(["remoto.change"]);
    expect(await mcp.call("remoto.change", {})).toEqual({ conteudo: [{ type: "text", text: "[REDACTED]" }], erro: false });
    expect(receivedHeader).toBe(`Bearer ${secret}`);
    expect(text).toContain('"url":"http://127.0.0.1:');
    expect(text).not.toContain(`?token=${secret}`);
    expect((await mcp.listManaged()).find((row) => row.name === "remoto")).toEqual(expect.objectContaining({ transport: "http", status: "connected", toolCount: 2, hasHeaders: true, url: remoteUrl }));
    await mcp.removeManaged(String(stored.find((row) => row.name === "remoto")?.id));
    await httpTransport?.close();
    httpTransport = undefined;
    await new Promise<void>((resolve) => remoteServer?.close(() => resolve()));
    remoteServer = undefined;
  }, 20000);

  it("recusa URL insegura e não inclui query string nos erros", async () => {
    const response = await fetch(`${baseUrl}/api/v1/mcp/servers`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "inseguro", transport: "http", url: "http://example.com/mcp?token=secret", enabled: true }) });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("token=secret");
  });

  it("faz fallback para servidor SSE local quando Streamable HTTP retorna 404", async () => {
    const server = new McpServer({ name: "fake-sse", version: "1" }, { capabilities: { tools: {} } });
    server.registerTool("sse_read", { inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "sse-ok" }] }));
    const sessions = new Map<string, SSEServerTransport>();
    remoteServer = createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/events") {
        const transport = new SSEServerTransport("/messages", res);
        sseTransport = transport;
        sessions.set(transport.sessionId, transport);
        await server.connect(transport);
        return;
      }
      if (req.method === "POST" && req.url?.startsWith("/messages?sessionId=")) {
        const id = new URL(req.url, "http://127.0.0.1").searchParams.get("sessionId") ?? "";
        const transport = sessions.get(id);
        if (transport) await transport.handlePostMessage(req, res);
        else { res.statusCode = 404; res.end(); }
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => remoteServer!.listen(0, "127.0.0.1", resolve));
    const address = remoteServer.address();
    if (!address || typeof address === "string") throw new Error("Servidor local indisponível.");
    const url = `http://127.0.0.1:${address.port}/events`;
    const response = await fetch(`${baseUrl}/api/v1/mcp/servers`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "sse", transport: "http", url, enabled: true }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"status":"connected"');
    expect(mcp.catalog()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sse.sse_read", risk: "read" })]));
    expect(await mcp.call("sse.sse_read", {})).toEqual({ conteudo: [{ type: "text", text: "sse-ok" }], erro: false });
    await mcp.removeManaged(String(stored.find((row) => row.name === "sse")?.id));
    await sseTransport?.close();
    sseTransport = undefined;
    await new Promise<void>((resolve) => remoteServer?.close(() => resolve()));
    remoteServer = undefined;
  }, 20000);
});
