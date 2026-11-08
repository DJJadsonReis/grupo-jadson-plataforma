import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { MemoryService } from "./memory.service";

type Row = Record<string, unknown>;

function fakeDatabase(handler: (text: string, values: unknown[]) => { rows: Row[]; rowCount: number }) {
  const pool = { query: async (text: string, values: unknown[] = []) => handler(text, values) };
  return { getPool: () => pool } as unknown as DatabaseService;
}

describe("MemoryService", () => {
  it("recusa memória vazia ou acima do limite", async () => {
    const service = new MemoryService(fakeDatabase(() => ({ rows: [], rowCount: 0 })));
    await expect(service.remember("   ")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remember("x".repeat(501))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("a memória vem ligada por padrão e desligada não entrega nada ao contexto", async () => {
    let enabled = true;
    const service = new MemoryService(fakeDatabase((text) => {
      if (text.includes("SELECT enabled")) return { rows: enabled ? [] : [{ enabled: false }], rowCount: enabled ? 0 : 1 };
      if (text.includes("SELECT content")) return { rows: [{ content: "prefere respostas curtas" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }));
    expect(await service.isEnabled()).toBe(true);
    expect(await service.contextLines()).toEqual(["prefere respostas curtas"]);
    enabled = false;
    expect(await service.isEnabled()).toBe(false);
    expect(await service.contextLines()).toEqual([]);
  });

  it("esquecer uma memória inexistente responde 404", async () => {
    const service = new MemoryService(fakeDatabase(() => ({ rows: [], rowCount: 0 })));
    await expect(service.forget("nao-existe")).rejects.toBeInstanceOf(NotFoundException);
  });
});
