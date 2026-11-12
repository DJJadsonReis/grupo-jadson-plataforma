import { BadRequestException } from "@nestjs/common";
import { ToolsService } from "./tools.service";

/** Banco falso: guarda as execuções em memória e responde às consultas que o serviço faz. */
function fakeDatabase() {
  const runs = new Map<string, Record<string, unknown>>();
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (text.startsWith("INSERT INTO tool_runs")) {
        const [id, tool, requestedBy, status, input, output, approvalId] = values as [string, string, string, string, string, string | null, string | null];
        const row = { id, tool, requestedBy, status, input: JSON.parse(input), output: output ? JSON.parse(output) : null, approvalId, createdAt: "", finishedAt: null };
        runs.set(id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (text.startsWith("UPDATE tool_runs")) {
        const row = runs.get(values[0] as string);
        if (row) row.status = values[2];
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("FROM tool_runs WHERE id")) {
        const row = runs.get(values[0] as string);
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { getPool: () => pool };
}

function build(approvalStatus: string) {
  const database = fakeDatabase();
  const memoryCalls: string[] = [];
  const approvalsCalls: string[] = [];
  const service = new ToolsService(
    database as never,
    {
      request: async (input: { action: string }) => { approvalsCalls.push(input.action); return { id: "ap-1" }; },
      get: async () => ({ id: "ap-1", status: approvalStatus }),
    } as never,
    { record: async () => undefined } as never,
    { list: async () => { memoryCalls.push("list"); return []; }, clear: async () => { memoryCalls.push("clear"); } } as never,
    { catalog: () => [], find: () => undefined, call: async () => ({}) } as never,
    { secret: async () => undefined } as never,
    { decisionFor: async () => null } as never,
    {} as never,
  );
  return { service, memoryCalls, approvalsCalls };
}

describe("ToolsService — ação sensível com aprovação", () => {
  it("deixa a execução pendente e não roda a ferramenta antes da aprovação", async () => {
    const { service, memoryCalls, approvalsCalls } = build("pending");
    const run = await service.invoke("memoria.apagar_tudo", {}, "Jadson");
    expect(run.status).toBe("pending_approval");
    expect(run.approvalId).toBe("ap-1");
    expect(approvalsCalls).toEqual(["tool.memoria.apagar_tudo"]);
    expect(memoryCalls).toEqual([]);
  });

  it("recusa executar quando a aprovação foi negada e não toca a memória", async () => {
    const { service, memoryCalls } = build("rejected");
    const run = await service.invoke("memoria.apagar_tudo", {}, "Jadson");
    await expect(service.executeApproved(run.id, "Jadson")).rejects.toBeInstanceOf(BadRequestException);
    expect(memoryCalls).toEqual([]);
  });
});
