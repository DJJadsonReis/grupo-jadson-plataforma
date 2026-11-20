import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { McpService } from "./mcp.service";

describe("McpService", () => {
  const originalEnvironment = { ...process.env };
  const services: McpService[] = [];
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "mcp-service-spec-"));
    for (const key of ["MCP_SERVERS", "MCP_FILESYSTEM_DISABLED", "MCP_FILESYSTEM_ROOT"]) delete process.env[key];
  });

  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.onModuleDestroy()));
    await rm(temporaryDirectory, { recursive: true, force: true });
    for (const key of ["MCP_SERVERS", "MCP_FILESYSTEM_DISABLED", "MCP_FILESYSTEM_ROOT"]) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
  });

  async function createService(): Promise<McpService> {
    const service = new McpService();
    services.push(service);
    await service.onModuleInit();
    return service;
  }

  function captureWarnings(): jest.SpyInstance {
    return jest.spyOn(Logger.prototype, "warn").mockImplementation();
  }

  async function filesystemRoot(): Promise<string> {
    const root = join(temporaryDirectory, "filesystem");
    await mkdir(root);
    process.env.MCP_FILESYSTEM_ROOT = root;
    return root;
  }

  async function fakeServer(toolName: string, readOnly: boolean): Promise<string> {
    const script = join(temporaryDirectory, `${toolName}.cjs`);
    await writeFile(script, `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  let result;
  if (message.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } };
  else if (message.method === "notifications/initialized") return;
  else if (message.method === "tools/list") result = { tools: [{ name: ${JSON.stringify(toolName)}, description: "fake tool", inputSchema: { type: "object" }, annotations: { readOnlyHint: ${readOnly} } }] };
  else if (message.method === "tools/call") result = { content: [{ type: "text", text: process.env.MCP_TEST_SECRET || "called" }] };
  else result = {};
  if (message.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\\n");
});
`);
    return script;
  }

  it("preserva catalogo e chamada do filesystem sem configuracao extra", async () => {
    const root = await filesystemRoot();
    const service = await createService();
    expect(service.catalog().some((tool) => tool.name === "arquivos.read_file" && tool.risk === "read")).toBe(true);
    const result = await service.call("arquivos.list_directory", { path: root }) as { erro: boolean };
    expect(result.erro).toBe(false);
    await expect(service.call("arquivos.nao_existe", {})).rejects.toThrow("Ferramenta de arquivos indisponível.");
  });

  it("registra servidor extra, calcula risco e roteia chamadas pelo prefixo", async () => {
    process.env.MCP_FILESYSTEM_DISABLED = "true";
    const script = await fakeServer("anotar", true);
    process.env.MCP_SERVERS = JSON.stringify([{ id: "notas", command: process.execPath, args: [script] }]);
    const service = await createService();
    expect(service.catalog()).toEqual([expect.objectContaining({ name: "notas.anotar", risk: "read" })]);
    expect(await service.call("notas.anotar", {})).toEqual({ conteudo: [{ type: "text", text: "called" }], erro: false });
    await expect(service.call("notas.desconhecida", {})).rejects.toThrow("Ferramenta de arquivos indisponível.");
  });

  it("mantem filesystem em JSON invalido ou entrada incompleta e rejeita id duplicado/reservado", async () => {
    const root = await filesystemRoot();
    const warn = captureWarnings();
    process.env.MCP_SERVERS = "{";
    const invalidJsonService = await createService();
    expect(invalidJsonService.catalog().some((tool) => tool.name.startsWith("arquivos."))).toBe(true);
    expect(warn).toHaveBeenCalled();
    await invalidJsonService.onModuleDestroy();

    const script = await fakeServer("tool", false);
    process.env.MCP_SERVERS = JSON.stringify([{ command: process.execPath, args: [script] }]);
    const incompleteService = await createService();
    expect(incompleteService.catalog().some((tool) => tool.name.startsWith("arquivos."))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    await incompleteService.onModuleDestroy();

    process.env.MCP_SERVERS = JSON.stringify([
      { id: "arquivos", command: process.execPath, args: [script] },
      { id: "repetido", command: process.execPath, args: [script] },
      { id: "repetido", command: process.execPath, args: [script] },
      { command: process.execPath, args: [script] },
    ]);
    const service = await createService();
    expect(service.catalog().filter((tool) => tool.name.startsWith("repetido."))).toHaveLength(1);
    expect(service.catalog().some((tool) => tool.name.startsWith("arquivos."))).toBe(true);
    expect(service.find("arquivos.read_file")).toBeDefined();
    await service.call("arquivos.list_directory", { path: root });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignora comando inexistente sem impedir servidor subsequente e mascara segredo de env no log", async () => {
    process.env.MCP_FILESYSTEM_DISABLED = "true";
    const secret = "marker-secret-value-98765";
    const script = await fakeServer("ok", false);
    process.env.MCP_SERVERS = JSON.stringify([
      { id: "ausente", command: "comando-mcp-inexistente-xyz", args: [], env: { MCP_TEST_SECRET: secret } },
      { id: "funcional", command: process.execPath, args: [script], env: { MCP_TEST_SECRET: secret } },
    ]);
    const warn = captureWarnings();
    const service = await createService();
    expect(service.catalog()).toEqual([expect.objectContaining({ name: "funcional.ok", risk: "sensitive" })]);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
    expect(await service.call("funcional.ok", {})).toEqual({ conteudo: [{ type: "text", text: secret }], erro: false });
    warn.mockRestore();
  });
});
