import { BadRequestException } from "@nestjs/common";
import { RoutinesController } from "./routines.controller";
import { RoutinesService } from "./routines.service";

describe("RoutinesController.create", () => {
  const service = { create: jest.fn(async (input) => input) } as unknown as RoutinesService;
  const controller = new RoutinesController(service);
  const request = { principal: { id: "dono" } };

  beforeEach(() => jest.clearAllMocks());

  it("aceita o modo de intervalo e o modo diário", async () => {
    await controller.create({ name: "rotina", tool: "tempo.agora", intervalMinutes: 30 }, request);
    expect(service.create).toHaveBeenLastCalledWith({ name: "rotina", tool: "tempo.agora", intervalMinutes: 30, owner: "dono" });
    await controller.create({ name: "rotina", tool: "tempo.agora", dailyAt: "08:00" }, request);
    expect(service.create).toHaveBeenLastCalledWith({ name: "rotina", tool: "tempo.agora", dailyAt: "08:00", owner: "dono" });
  });

  it.each([
    { dailyAt: "8:00" }, { dailyAt: "24:00" }, { dailyAt: "12:60" }, { dailyAt: "abc" }, { dailyAt: 800 },
    { intervalMinutes: 30, dailyAt: "08:00" }, {},
  ])("rejeita corpo inválido %#", (schedule) => {
    expect(() => controller.create({ name: "rotina", tool: "tempo.agora", ...schedule }, request)).toThrow(BadRequestException);
  });
});
