import { migrationId, up } from "./040-model-availability";

describe("040-model-availability", () => {
  it("cria tabela por provedor e modelo com estado e data, sem alterar migrações anteriores", async () => {
    const query = jest.fn().mockResolvedValue({});
    await up({ query } as never);
    expect(migrationId).toBe("040-model-availability");
    expect(String(query.mock.calls[0]?.[0])).toContain("status text NOT NULL CHECK (status IN ('disponivel','indisponivel','nao_verificado'))");
    expect(String(query.mock.calls[0]?.[0])).toContain("checked_at timestamptz NOT NULL DEFAULT now()");
  });
});
