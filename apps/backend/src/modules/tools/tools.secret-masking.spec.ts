import { ToolsService, ToolRun } from "./tools.service";
import { SECRET_REDACTION_MARKER } from "../../common/secret-masking";

function build(call: () => Promise<unknown>, knownSecret: string) {
  const inserted: ToolRun[] = [];
  const pool = {
    query: async (_sql: string, values: unknown[] = []) => {
      const [id, tool, requestedBy, status, input, output, approvalId] = values as [string, string, string, string, string, string | null, string | null];
      const row = {
        id, tool, requestedBy, status, input: JSON.parse(input), output: output ? JSON.parse(output) : null,
        approvalId, createdAt: "", finishedAt: null,
      } as ToolRun;
      inserted.push(row);
      return { rows: [row], rowCount: 1 };
    },
  };
  const service = new ToolsService(
    { getPool: () => pool } as never,
    { request: jest.fn() } as never,
    { record: jest.fn() } as never,
    { list: async () => [] } as never,
    { catalog: () => [{ name: "pesquisa.externa", description: "Pesquisa", risk: "read" }], find: () => ({ name: "pesquisa.externa" }), call } as never,
    {
      secret: async () => knownSecret,
      secretValuesForMasking: async () => [knownSecret],
    } as never,
    { decisionFor: async () => null } as never,
    {} as never,
  );
  return { service, inserted };
}

describe("ToolsService secret masking", () => {
  it("mascara segredos conhecidos no resultado antes de persistir e devolver", async () => {
    const secret = "known-integration-secret";
    const { service, inserted } = build(async () => ({ results: [`value=${secret}`] }), secret);
    const run = await service.invoke("pesquisa.externa", {}, "Jadson");
    expect(JSON.stringify(run.output)).toContain(SECRET_REDACTION_MARKER);
    expect(JSON.stringify(run.output)).not.toContain(secret);
    expect(JSON.stringify(inserted[0]?.output)).not.toContain(secret);
  });

  it("mascara token no corpo do erro antes de persistir e devolver", async () => {
    const secret = "tvly-1234567890abcdef";
    const { service, inserted } = build(async () => { throw new Error(`HTTP 500 body: Bearer ${secret}`); }, secret);
    const run = await service.invoke("pesquisa.externa", {}, "Jadson");
    expect((run.output as { mensagem: string }).mensagem).toBe(`HTTP 500 body: Bearer ${SECRET_REDACTION_MARKER}`);
    expect(JSON.stringify(inserted[0]?.output)).not.toContain(secret);
  });
});
