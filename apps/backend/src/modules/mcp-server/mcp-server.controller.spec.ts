import { UnauthorizedException } from "@nestjs/common";
import { McpServerController } from "./mcp-server.controller";

describe("McpServerController autenticação e limite", () => {
  const tokens = { resolve: jest.fn(), list: jest.fn(), create: jest.fn(), revoke: jest.fn() };
  const tools = { definitions: () => [], resources: async () => [], readAgentResource: async () => null, call: jest.fn(async () => ({ ok: true })) };
  const audit = { record: jest.fn(async () => undefined) };
  const controller = new McpServerController(tokens as never, tools as never, audit as never);
  const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() });

  beforeEach(() => { jest.clearAllMocks(); });

  it.each([
    ["sem header", "", null], ["inválido", "Bearer token-falso", null], ["revogado", "Bearer gjm_revogado", null],
  ])("responde 401 para token %s", async (_case, authorization, resolved) => {
    tokens.resolve.mockResolvedValue(resolved);
    const result = response();
    await expect(controller.rpc({ headers: { authorization } } as never, { jsonrpc: "2.0", id: 1, method: "ping" }, result as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("retorna 413 acima de 64 KB e audita chamada sem guardar argumentos livres", async () => {
    tokens.resolve.mockResolvedValue({ ownerId: "person-a", tokenId: "id-abcdef" });
    const large = response();
    await controller.rpc({ headers: { authorization: "Bearer gjm_falso_para_teste" }, rawBodyLength: 65_537 } as never, {}, large as never);
    expect(large.status).toHaveBeenCalledWith(413);

    const normal = response();
    const secret = "texto livre fictício";
    await controller.rpc({ headers: { authorization: "Bearer gjm_falso_para_teste" }, rawBodyLength: 90 } as never, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "tarefas_criar", arguments: { title: secret } } }, normal as never);
    expect(audit.record).toHaveBeenCalledWith({ actor: "person-a", action: "mcp.call", subject: "tarefas_criar", details: { token: "…abcdef", result: "ok" } });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("gjm_falso_para_teste");
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(secret);
  });
});
