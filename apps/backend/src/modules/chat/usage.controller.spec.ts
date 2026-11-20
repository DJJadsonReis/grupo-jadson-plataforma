import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiTokenGuard } from "../auth/api-token.guard";
import { ADMIN_ONLY_ROUTE } from "../auth/roles";
import { UsersService } from "../auth/users.service";
import { clampDays, UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

describe("clampDays", () => {
  it("usa 30 dias quando o valor é inválido", () => {
    expect(clampDays(Number.NaN)).toBe(30);
  });

  it("mantém o intervalo entre 1 e 365 dias", () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-7)).toBe(1);
    expect(clampDays(9999)).toBe(365);
    expect(clampDays(14.9)).toBe(14);
  });
});

describe("UsageController.summary", () => {
  it("consulta a partir de N dias atrás e devolve o período usado", async () => {
    const calls: Array<{ owner: string | null; since: string }> = [];
    const usage = {
      summaryForOwner: async (owner: string | null, since: string) => {
        calls.push({ owner, since });
        return { byAgent: [{ agentId: null, totalTokens: 10, calls: 1, costUsd: null, callsWithoutPrice: 1 }], byConversation: [] };
      },
    } as unknown as UsageService;
    const controller = new UsageController(usage);
    const before = Date.now();
    const result = await controller.summary("7", { principal: { id: "pessoa-a", role: "operator" } });
    expect(result.days).toBe(7);
    expect(result.agents).toHaveLength(1);
    expect(calls[0]?.owner).toBe("pessoa-a");
    expect(result).not.toHaveProperty("byPerson");
    const sinceMs = Date.parse(calls[0]?.since ?? "");
    expect(before - sinceMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
  });

  it("asks the service for all owners for admins", async () => {
    const summaryForOwner = jest.fn(async () => ({ byAgent: [], byConversation: [], byPerson: [{ personId: "pessoa-a", totalTokens: 2, calls: 1, costUsd: null, callsWithoutPrice: 1 }] }));
    const controller = new UsageController({ summaryForOwner } as unknown as UsageService);
    const result = await controller.summary("30", { principal: { id: "admin", role: "admin" } });
    expect(summaryForOwner).toHaveBeenCalledWith(null, expect.any(String));
    expect(result.byPerson).toHaveLength(1);
  });
});

describe("UsageController model prices", () => {
  it("lets admin list, save and remove model prices", async () => {
    const usage = {
      listPrices: jest.fn().mockResolvedValue({ prices: [], modelsWithoutPrice: [] }),
      setPrice: jest.fn().mockResolvedValue({ provider: "fixture", model: "model", updatedBy: "admin" }),
      removePrice: jest.fn().mockResolvedValue(true),
    } as unknown as UsageService;
    const controller = new UsageController(usage);
    const req = { principal: { id: "admin-id", role: "admin" } };
    await expect(controller.listPrices()).resolves.toEqual({ prices: [], modelsWithoutPrice: [] });
    await expect(controller.setPrice({ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }, req)).resolves.toMatchObject({ updatedBy: "admin" });
    expect(usage.setPrice).toHaveBeenCalledWith({ provider: "fixture", model: "model", inputUsdPerMillion: 2, outputUsdPerMillion: 8 }, "admin-id");
    await expect(controller.removePrice("fixture", "model", req)).resolves.toEqual({ removed: true });
  });

  it.each(["operator", "viewer"]) ("denies all price routes to %s", async (role) => {
    const controller = new UsageController({} as UsageService);
    for (const method of ["listPrices", "setPrice", "removePrice"] as const) {
      const handler = Object.getPrototypeOf(controller)[method] as Function;
      const reflector = { getAllAndOverride: (key: string) => key === ADMIN_ONLY_ROUTE && Reflect.getMetadata(ADMIN_ONLY_ROUTE, handler) } as unknown as Reflector;
      const users = { findByToken: async () => ({ id: "person", name: "Pessoa", role }), findBySession: async () => null } as unknown as UsersService;
      const roleGuard = new ApiTokenGuard(reflector, users);
      const context = { getHandler: () => handler, getClass: () => UsageController, switchToHttp: () => ({ getRequest: () => ({ method: method === "listPrices" ? "GET" : method === "setPrice" ? "PUT" : "DELETE", url: "/api/v1/usage/prices", headers: { authorization: "Bearer fixture" } }) }) };
      await expect(roleGuard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it.each([
    { provider: "", model: "m", inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    { provider: "p", model: " ", inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
    { provider: "p", model: "m", inputUsdPerMillion: -1, outputUsdPerMillion: 1 },
    { provider: "p", model: "m", inputUsdPerMillion: Number.NaN, outputUsdPerMillion: 1 },
    { provider: "p", model: "m", inputUsdPerMillion: "1", outputUsdPerMillion: 1 },
    { provider: "p", model: "m", inputUsdPerMillion: 1001, outputUsdPerMillion: 1 },
    { provider: "p", model: "m".repeat(121), inputUsdPerMillion: 1, outputUsdPerMillion: 1 },
  ])("rejects invalid price input with a fixed message", async (body) => {
    const controller = new UsageController({ setPrice: jest.fn() } as unknown as UsageService);
    try { await controller.setPrice(body, { principal: { id: "a", role: "admin" } }); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe("Informe provedor, modelo e preços válidos entre US$ 0 e US$ 1.000 por milhão de tokens.");
    }
  });

  it("returns 404 when a price is missing", async () => {
    const controller = new UsageController({ removePrice: jest.fn().mockResolvedValue(false) } as unknown as UsageService);
    await expect(controller.removePrice("p", "m", { principal: { id: "a", role: "admin" } })).rejects.toBeInstanceOf(NotFoundException);
  });
});
