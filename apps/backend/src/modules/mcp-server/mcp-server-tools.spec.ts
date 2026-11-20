import { McpServerTools } from "./mcp-server-tools";

describe("McpServerTools", () => {
  const tasks = { list: jest.fn(async (owner: string) => [{ owner }]), create: jest.fn(async (owner: string, input: unknown) => ({ owner, input })) };
  const memory = { isEnabled: jest.fn(async () => true), list: jest.fn(async (owner: string) => [{ owner }]), remember: jest.fn(async (content: string, owner: string) => ({ content, owner })) };
  const agents = { list: jest.fn(async () => [{ id: "a", name: "A", instructions: "internal", toolsAllowed: ["x"], endpointUrl: "private" }, { id: "b", name: "B", instructions: "secret" }]), get: jest.fn(async () => ({ id: "a", name: "Agent", description: "Visible", instructions: "hidden" })) };
  const permissions = { listAccessible: jest.fn(async () => [{ id: "a", access: "user" as const }]), access: jest.fn(async () => "user") };
  const routines = { list: jest.fn(async (owner: string) => [{ owner }]) };
  const notifications = { listUnread: jest.fn(async (owner: string) => [{ owner }]) };
  const database = { checkConnection: jest.fn(async () => true), isVectorReady: jest.fn(() => true) };
  const redis = { checkConnection: jest.fn(async () => false) };
  const queue = { getDriver: jest.fn(() => "process-memory") };
  const service = new McpServerTools(tasks as never, memory as never, agents as never, permissions as never, routines as never, notifications as never, database as never, redis as never, queue as never);

  it("routes every tool to the caller owner and respects disabled memory", async () => {
    const owner = "person-b";
    await expect(service.call("tarefas_listar", {}, owner)).resolves.toEqual([{ owner }]);
    await expect(service.call("tarefas_criar", { title: "Ação" }, owner)).resolves.toMatchObject({ owner });
    await expect(service.call("memoria_listar", {}, owner)).resolves.toEqual([{ owner }]);
    await expect(service.call("memoria_lembrar", { content: "texto" }, owner)).resolves.toEqual({ content: "texto", owner });
    const visibleAgents = await service.call("agentes_listar", {}, owner) as Array<Record<string, unknown>>;
    expect(visibleAgents).toHaveLength(1);
    expect(visibleAgents[0]).toMatchObject({ id: "a", name: "A" });
    expect(visibleAgents[0]).not.toHaveProperty("instructions");
    expect(visibleAgents[0]).not.toHaveProperty("endpointUrl");
    await expect(service.call("rotinas_listar", {}, owner)).resolves.toEqual([{ owner }]);
    await expect(service.call("notificacoes_listar", {}, owner)).resolves.toEqual([{ owner }]);
    await expect(service.call("plataforma_status", {}, owner)).resolves.toMatchObject({ services: { postgres: "connected" } });
    expect(tasks.list).toHaveBeenCalledWith(owner);
    expect(memory.remember).toHaveBeenCalledWith("texto", owner);
    memory.isEnabled.mockResolvedValueOnce(false);
    await expect(service.call("memoria_listar", {}, owner)).resolves.toEqual([]);
    expect(memory.list).toHaveBeenCalledTimes(1);
  });

  it("limits agent metadata resources to visible records and hides internal instructions", async () => {
    await expect(service.resources("person-b")).resolves.toEqual([{ uri: "agente://a", name: "Agent", description: "Visible", mimeType: "application/json" }]);
    await expect(service.readAgentResource("agente://a", "person-b")).resolves.toMatchObject({ id: "a", name: "Agent" });
    expect(await service.readAgentResource("agente://a", "person-b")).not.toHaveProperty("instructions");
    expect(await service.readAgentResource("arquivo://privado", "person-b")).toBeNull();
  });
});
