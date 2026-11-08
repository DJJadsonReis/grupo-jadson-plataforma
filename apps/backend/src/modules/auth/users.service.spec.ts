import { BadRequestException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { hashToken, UsersService } from "./users.service";

/** Banco simulado: responde à contagem de administradores conforme `otherAdmins` e `isAdmin`. */
function fakeService(state: { otherAdmins: number; isAdmin: boolean }) {
  const pool = {
    query: async (text: string) => {
      if (text.includes("others")) return { rowCount: 1, rows: [{ others: state.otherAdmins, is_admin: state.isAdmin }] };
      return { rowCount: 1, rows: [{ id: "x", name: "n", role: "viewer", active: true, createdAt: "" }] };
    },
  };
  return new UsersService({ getPool: () => pool } as unknown as DatabaseService);
}

describe("UsersService", () => {
  it("guarda o token como hash, nunca em texto", () => {
    expect(hashToken("segredo")).not.toContain("segredo");
    expect(hashToken("segredo")).toHaveLength(64);
  });

  it("não deixa rebaixar o último administrador ativo", async () => {
    await expect(fakeService({ otherAdmins: 0, isAdmin: true }).setRole("1", "viewer")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("não deixa desativar o último administrador ativo", async () => {
    await expect(fakeService({ otherAdmins: 0, isAdmin: true }).setActive("1", false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("permite rebaixar quando há outro administrador ativo", async () => {
    await expect(fakeService({ otherAdmins: 1, isAdmin: true }).setRole("1", "viewer")).resolves.toBeDefined();
  });

  it("recusa papel desconhecido", async () => {
    await expect(fakeService({ otherAdmins: 1, isAdmin: true }).setRole("1", "root" as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
