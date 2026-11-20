import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { McpService, validateManagedInput, validateRemoteUrl } from "./mcp.service";

describe("McpService", () => {
  const originalEnvironment = { ...process.env };
  const services: McpService[] = [];
  let temporaryDirectory: string;

  beforeEach(async () => { temporaryDirectory = await mkdtemp(join(tmpdir(), "mcp-service-spec-")); for (const key of ["MCP_SERVERS", "MCP_FILESYSTEM_DISABLED", "MCP_FILESYSTEM_ROOT"]) delete process.env[key]; });
  afterEach(async () => { await Promise.all(services.splice(0).map((service) => service.onModuleDestroy())); await rm(temporaryDirectory, { recursive: true, force: true }); for (const key of ["MCP_SERVERS", "MCP_FILESYSTEM_DISABLED", "MCP_FILESYSTEM_ROOT"]) { if (originalEnvironment[key] === undefined) delete process.env[key]; else process.env[key] = originalEnvironment[key]; } });
  async function createService(): Promise<McpService> { const service = new McpService(); services.push(service); await service.onModuleInit(); return service; }
  function captureWarnings(): jest.SpyInstance { return jest.spyOn(Logger.prototype, "warn").mockImplementation(); }

  it("valida comandos locais e URLs remotas com regras de segurança", () => {
    const valid = { name: "servidor", command: "node", args: [], enabled: true };
    for (const input of [{ ...valid, name: "Nome ruim" }, { ...valid, command: "node --flag" }, { ...valid, command: "powershell" }, { ...valid, args: ["x".repeat(201)] }, { ...valid, args: Array.from({ length: 21 }, () => "x") }, { ...valid, env: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`KEY_${index}`, "value"])) }]) expect(() => validateManagedInput(input)).toThrow();
    expect(validateRemoteUrl("https://mcp.example.com/mcp").protocol).toBe("https:"); expect(validateRemoteUrl("http://127.0.0.1:4321/mcp").hostname).toBe("127.0.0.1");
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/#fragment", "https://169.254.1.1", "https://[fd00:ec2::1]", `https://${"a".repeat(2001)}`]) expect(() => validateRemoteUrl(url)).toThrow();
  });

  async function filesystemRoot(): Promise<string> { const root = join(temporaryDirectory, "filesystem"); await mkdir(root); process.env.MCP_FILESYSTEM_ROOT = root; return root; }
  async function fakeServer(toolName: string, readOnly: boolean): Promise<string> {
    const script = join(temporaryDirectory, `${toolName}.cjs`);
    await writeFile(script, `const readline=require("node:readline");const rl=readline.createInterface({input:process.stdin});rl.on("line",line=>{const m=JSON.parse(line);let r;if(m.method==="initialize")r={protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"fake",version:"1"}};else if(m.method==="notifications/initialized")return;else if(m.method==="tools/list")r={tools:[{name:${JSON.stringify(toolName)},description:"fake",inputSchema:{type:"object"},annotations:{readOnlyHint:${readOnly}}}]};else if(m.method==="tools/call")r={content:[{type:"text",text:"called"}]};else r={};if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:m.id,result:r})+"\\n")});`);
    return script;
  }

  it("preserva o servidor de arquivos", async () => { const root = await filesystemRoot(); const service = await createService(); expect(service.catalog().some((tool) => tool.name === "arquivos.read_file" && tool.risk === "read")).toBe(true); expect((await service.call("arquivos.list_directory", { path: root }) as { erro: boolean }).erro).toBe(false); await expect(service.call("arquivos.nao_existe", {})).rejects.toThrow("Ferramenta de arquivos indisponível."); });
  it("registra servidor stdio e roteia ferramenta", async () => { process.env.MCP_FILESYSTEM_DISABLED = "true"; const script = await fakeServer("anotar", true); process.env.MCP_SERVERS = JSON.stringify([{ id: "notas", command: process.execPath, args: [script] }]); const service = await createService(); expect(service.catalog()).toEqual([expect.objectContaining({ name: "notas.anotar", risk: "read" })]); expect(await service.call("notas.anotar", {})).toEqual({ conteudo: [{ type: "text", text: "called" }], erro: false }); });
  it("mantém filesystem em configuração MCP inválida", async () => { const root = await filesystemRoot(); const warn = captureWarnings(); process.env.MCP_SERVERS = "{"; const service = await createService(); expect(service.catalog().some((tool) => tool.name.startsWith("arquivos."))).toBe(true); expect(warn).toHaveBeenCalled(); await service.call("arquivos.list_directory", { path: root }); warn.mockRestore(); });
  it("mascara segredo de ambiente nos logs", async () => { process.env.MCP_FILESYSTEM_DISABLED = "true"; const secret = "marker-secret-value-98765"; const script = await fakeServer("ok", false); process.env.MCP_SERVERS = JSON.stringify([{ id: "ausente", command: "comando-mcp-inexistente-xyz", args: [], env: { MCP_TEST_SECRET: secret } }, { id: "funcional", command: process.execPath, args: [script], env: { MCP_TEST_SECRET: secret } }]); const warn = captureWarnings(); const service = await createService(); expect(service.catalog()).toEqual([expect.objectContaining({ name: "funcional.ok", risk: "sensitive" })]); expect(warn.mock.calls.flat().join(" ")).not.toContain(secret); warn.mockRestore(); });
  it("conecta servidor gerenciado e remove ferramentas ao desligar", async () => {
    process.env.MCP_FILESYSTEM_DISABLED = "true"; const stored: Array<Record<string, unknown>> = [];
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT id,name,command,args,enabled,env_secret,transport,url,headers_secret FROM mcp_servers WHERE id")) return { rows: stored.filter((row) => row.id === values[0]) };
      if (sql.includes("SELECT count(*)")) return { rows: [{ count: 0 }] };
      if (sql.includes("INSERT INTO mcp_servers")) { stored.push({ id: values[0], name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5], transport: values[6], url: values[7], headers_secret: values[8], status: "error", status_message: "" }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET name")) { Object.assign(stored.find((row) => row.id === values[0])!, { name: values[1], command: values[2], args: JSON.parse(String(values[3])), env_secret: values[4], enabled: values[5], transport: values[6], url: values[7], headers_secret: values[8] }); return { rows: [] }; }
      if (sql.includes("UPDATE mcp_servers SET status")) { Object.assign(stored.find((row) => row.id === values[0])!, { status: values[1], status_message: values[2] }); return { rows: [] }; }
      if (sql.includes("SELECT id,name,command,args,enabled,status,status_message,env_secret,transport,url,headers_secret")) return { rows: stored };
      return { rows: [] };
    });
    const service = new McpService({ isReady: () => true, getPool: () => ({ query }) } as never); services.push(service); await service.onModuleInit();
    const result = await service.saveManaged(null, { name: "gerenciado", command: process.execPath, args: [join(__dirname, "fixtures", "fake-mcp-server.js")], enabled: true }); expect(result).toMatchObject({ status: "connected", toolCount: 1, hasEnv: false, transport: "stdio" });
    expect(await service.call("gerenciado.ping", {})).toEqual({ conteudo: [{ type: "text", text: "pong" }], erro: false }); await service.saveManaged(result.id, { enabled: false }); expect(service.catalog()).toEqual([]); await expect(service.call("gerenciado.ping", {})).rejects.toThrow();
  });
});
