import { BadRequestException } from "@nestjs/common";
import { UserPreferencesController } from "./user-preferences.controller";
import { UserPreferencesService } from "./user-preferences.service";

describe("preferências por pessoa", () => {
  it("grava sob o owner fornecido e rejeita valores inválidos", async () => {
    const query = jest.fn(async (_sql: string, _args: unknown[]) => ({ rows: [{ instructions: "Responda em tópicos", responseStyle: "concise" }], rowCount: 1 }));
    const service = new UserPreferencesService({ getPool: () => ({ query }) } as never);
    await service.update("owner-1", { instructions: "Responda em tópicos", responseStyle: "concise" });
    expect(query.mock.calls[1]?.[1]).toEqual(["owner-1", "Responda em tópicos", "concise"]);
    await expect(service.update("owner-1", { instructions: "x".repeat(3001) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update("owner-1", { responseStyle: "random" as never })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("controller ignora owner no corpo e usa somente principal autenticado", async () => {
    const update = jest.fn(async (owner: string) => ({ owner }));
    const controller = new UserPreferencesController({ update } as never);
    await controller.update({ principal: { id: "pessoa-autenticada" } }, { owner: "outra-pessoa", instructions: "preferência" });
    expect(update).toHaveBeenCalledWith("pessoa-autenticada", { owner: "outra-pessoa", instructions: "preferência" });
  });

  it("controller rejeita estilo inválido e instruções acima do limite com código HTTP", async () => {
    const update = jest.fn();
    const controller = new UserPreferencesController({ update } as never);
    for (const body of [{ responseStyle: "invalido" }, { instructions: "x".repeat(3001) }]) {
      try {
        await controller.update({ principal: { id: "pessoa" } }, body);
        throw new Error("esperava HTTP 400");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
        expect((error as BadRequestException).getResponse()).toMatchObject({ code: "INVALID_PREFERENCES" });
      }
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("controller aceita estilo válido e 3000 caracteres", async () => {
    const update = jest.fn(async (_owner: string, value: unknown) => value);
    const controller = new UserPreferencesController({ update } as never);
    const value = { instructions: "x".repeat(3000), responseStyle: "detailed" as const };
    await expect(controller.update({ principal: { id: "pessoa" } }, value)).resolves.toEqual(value);
    expect(update).toHaveBeenCalledWith("pessoa", value);
  });

  it("rejeita instruções que não sejam texto e campos extras", async () => {
    const update = jest.fn();
    const controller = new UserPreferencesController({ update } as never);
    expect(() => controller.update({ principal: { id: "pessoa" } }, { instructions: 12 })).toThrow(BadRequestException);
    expect(() => controller.update({ principal: { id: "pessoa" } }, { owner: "outro" })).not.toThrow();
    expect(update).toHaveBeenCalledWith("pessoa", { owner: "outro" });
  });
});
