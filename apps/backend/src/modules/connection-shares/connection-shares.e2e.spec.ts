import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConnectionSharesService } from "./connection-shares.service";
describe("connection shares with fake database and Google", () => {
  it("does not expose tokens and rejects a pending share", async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const service = new ConnectionSharesService({ getPool: () => ({ query }) } as never, { status: async () => ({ connected: true }) } as never, { record: async () => undefined } as never);
    await expect(service.resolveOwner("grantee", "owner")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.request("invalid", { id: "owner", name: "Ana", role: "operator" })).rejects.toBeInstanceOf(BadRequestException);
    expect(JSON.stringify({ code: "CONEXAO_NAO_LIBERADA", message: "Você não tem acesso a esta conexão." })).not.toMatch(/refresh_token|access_token|secret|email|token/i);
  });
});
