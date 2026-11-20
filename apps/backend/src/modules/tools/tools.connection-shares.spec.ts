import { ForbiddenException } from "@nestjs/common";
import { ToolsService } from "./tools.service";

function build(resolveOwner: jest.Mock) {
  const google = { listEvents: jest.fn().mockResolvedValue([]) };
  const db = { getPool: () => ({ query: async (sql: string, values: unknown[]) => {
    if (sql.includes("INSERT INTO tool_runs")) return { rowCount: 1, rows: [{ id: values[0], tool: values[1], requestedBy: values[2], status: values[3], input: JSON.parse(values[4] as string), output: JSON.parse(values[5] as string), approvalId: null, createdAt: "", finishedAt: "" }] };
    return { rowCount: 0, rows: [] };
  } }) };
  const service = new ToolsService(db as never, {} as never, { record: async () => undefined } as never, {} as never,
    { catalog: () => [], find: () => undefined, call: async () => ({}) } as never,
    { secret: async () => undefined, secretValuesForMasking: async () => [] } as never,
    { decisionFor: async () => null } as never, google as never, undefined, { resolveOwner } as never);
  return { service, google };
}

describe("Google tools with shared connections", () => {
  it("does not call Google when the share is not approved", async () => {
    const resolveOwner = jest.fn().mockRejectedValue(new ForbiddenException({ code: "CONEXAO_NAO_LIBERADA", message: "Você não tem acesso a esta conexão." }));
    const { service, google } = build(resolveOwner);
    const run = await service.invoke("agenda.listar_eventos", { conexao_de: "owner" }, "grantee", undefined, "grantee");
    expect(run.status).toBe("failed");
    expect(run.output).toMatchObject({ code: "CONEXAO_NAO_LIBERADA" });
    expect(resolveOwner).toHaveBeenCalledWith("grantee", "owner");
    expect(google.listEvents).not.toHaveBeenCalled();
  });
  it("uses the owner's Google connection after approval", async () => {
    const resolveOwner = jest.fn().mockResolvedValue("owner");
    const { service, google } = build(resolveOwner);
    const run = await service.invoke("agenda.listar_eventos", { conexao_de: "owner" }, "grantee", undefined, "grantee");
    expect(run.status).toBe("done");
    expect(google.listEvents).toHaveBeenCalledWith("owner");
  });
  it("keeps the caller's own connection when conexao_de is absent", async () => {
    const resolveOwner = jest.fn();
    const { service, google } = build(resolveOwner);
    await service.invoke("agenda.listar_eventos", {}, "grantee", undefined, "grantee");
    expect(resolveOwner).not.toHaveBeenCalled();
    expect(google.listEvents).toHaveBeenCalledWith("grantee");
  });
});
