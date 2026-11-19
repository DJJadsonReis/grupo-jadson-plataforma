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
});
