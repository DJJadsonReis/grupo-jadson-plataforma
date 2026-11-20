import { HealthController } from "./health.controller";
import { DatabaseService } from "../database/database.service";
import { RedisService } from "../redis/redis.service";
import { QueueService } from "../queue/queue.service";

describe("HealthController", () => {
  it("mantém o contrato de status e dependências sem conexões reais", async () => {
    const database = { checkConnection: jest.fn().mockResolvedValue(true), isVectorReady: jest.fn().mockReturnValue(false) };
    const redis = { checkConnection: jest.fn().mockResolvedValue(false) };
    const queue = { getDriver: jest.fn().mockReturnValue("process-memory") };
    const controller = new HealthController(database as unknown as DatabaseService, redis as unknown as RedisService, queue as unknown as QueueService);

    const payload = await controller.check();
    expect(payload).toMatchObject({
      status: "ok", application: "Grupo Jadson", stage: "development",
      dependencies: { postgres: "connected", pgvector: "unavailable", redis: "unavailable", queue: { driver: "process-memory", persistence: "process-memory" } },
    });
    expect(payload.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    expect(database.checkConnection).toHaveBeenCalledTimes(1);
    expect(redis.checkConnection).toHaveBeenCalledTimes(1);
  });
});
