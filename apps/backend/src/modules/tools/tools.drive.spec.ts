import { ForbiddenException } from "@nestjs/common";
import { ToolsService } from "./tools.service";

function fakeDatabase() {
  const runs = new Map<string, Record<string, unknown>>();
  return {
    runs,
    getPool: () => ({ query: async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("INSERT INTO tool_runs")) {
        const [id, tool, requestedBy, status, input, output, approvalId] = values as [string, string, string, string, string, string | null, string | null];
        const row = { id, tool, requestedBy, status, input: JSON.parse(input), output: output ? JSON.parse(output) : null, approvalId, createdAt: "", finishedAt: null };
        runs.set(id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE tool_runs")) {
        const row = runs.get(values[0] as string);
        if (row) { row.status = values[2] as string; row.output = JSON.parse(values[1] as string); }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM tool_runs WHERE id")) {
        const row = runs.get(values[0] as string);
        return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    } }),
  };
}

function build(approvalStatus: string, ownerResult: string | Error = "owner") {
  const database = fakeDatabase();
  const createDocument = jest.fn().mockResolvedValue({ id: "doc-1", link: "https://drive.google.test/doc-1" });
  const resolveOwner = jest.fn().mockImplementation(async () => { if (ownerResult instanceof Error) throw ownerResult; return ownerResult; });
  const approvals = {
    request: jest.fn().mockResolvedValue({ id: "approval-1" }),
    get: jest.fn().mockResolvedValue({ id: "approval-1", status: approvalStatus }),
  };
  const service = new ToolsService(
    database as never,
    approvals as never,
    { record: async () => undefined } as never,
    {} as never,
    { catalog: () => [], find: () => undefined, call: async () => ({}) } as never,
    { secret: async () => undefined, secretValuesForMasking: async () => [] } as never,
    { decisionFor: async () => null } as never,
    { createDocument } as never,
    undefined,
    { resolveOwner } as never,
  );
  return { service, database, approvals, createDocument, resolveOwner };
}

describe("drive.criar_arquivo ponta a ponta", () => {
  it("registra a ação sensível e não chama Google até aprovação", async () => {
    const { service, approvals, createDocument } = build("pending");
    const pending = await service.invoke("drive.criar_arquivo", { nome: "Ata", texto: "Texto" }, "admin", undefined, "requester");
    expect(pending.status).toBe("pending_approval");
    expect(pending.approvalId).toBe("approval-1");
    expect(approvals.request).toHaveBeenCalledWith(expect.objectContaining({ action: "tool.drive.criar_arquivo" }));
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("cria depois da aprovação e resolve a conexão compartilhada do dono", async () => {
    const { service, createDocument, resolveOwner } = build("approved");
    const pending = await service.invoke("drive.criar_arquivo", { nome: "Ata", texto: "Texto", conexao_de: "owner" }, "admin", undefined, "requester");
    const completed = await service.executeApproved(pending.id, "admin");
    expect(completed.status).toBe("done");
    expect(completed.output).toMatchObject({ id: "doc-1", link: "https://drive.google.test/doc-1" });
    expect(resolveOwner).toHaveBeenCalledWith("requester", "owner");
    expect(createDocument).toHaveBeenCalledWith("owner", expect.objectContaining({ nome: "Ata", texto: "Texto" }));
  });

  it("não chama Google se o compartilhamento for negado", async () => {
    const denied = new ForbiddenException({ code: "CONEXAO_NAO_LIBERADA", message: "negado" });
    const { service, createDocument, resolveOwner } = build("approved", denied);
    const pending = await service.invoke("drive.criar_arquivo", { nome: "Ata", texto: "Texto", conexao_de: "owner" }, "admin", undefined, "requester");
    const completed = await service.executeApproved(pending.id, "admin");
    expect(completed.status).toBe("failed");
    expect(completed.output).toMatchObject({ code: "CONEXAO_NAO_LIBERADA" });
    expect(resolveOwner).toHaveBeenCalledWith("requester", "owner");
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("não registra o token nem o texto no erro retornado pelo Drive", async () => {
    const privateText = "CONTEUDO-PRIVADO-FALSO";
    const { service, createDocument } = build("approved");
    createDocument.mockRejectedValue(new Error("O Drive respondeu com HTTP 403. token-falso-secreto " + privateText));
    const pending = await service.invoke("drive.criar_arquivo", { nome: "Ata", texto: privateText }, "admin", undefined, "requester");
    const completed = await service.executeApproved(pending.id, "admin");
    const output = JSON.stringify(completed.output);
    expect(completed.status).toBe("failed");
    expect(output).not.toContain("token-falso-secreto");
    expect(output).not.toContain(privateText);
  });
});
