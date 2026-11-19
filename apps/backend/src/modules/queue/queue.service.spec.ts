import { ServiceUnavailableException } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { QueueService } from "./queue.service";

describe("QueueService Redis requirement", () => {
  const previous = { nodeEnv: process.env.NODE_ENV, driver: process.env.QUEUE_DRIVER };
  afterEach(() => {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.driver === undefined) delete process.env.QUEUE_DRIVER; else process.env.QUEUE_DRIVER = previous.driver;
  });

  it("does not require Redis in production while no durable queue is selected", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.QUEUE_DRIVER;
    const redis = { isReady: () => false, checkConnection: async () => false } as unknown as RedisService;
    const queue = new QueueService(redis);
    await expect(queue.onModuleInit()).resolves.toBeUndefined();
    expect(queue.getDriver()).toBe("memory");
  });

  it("requires Redis when the deployment explicitly selects the Redis queue", async () => {
    process.env.NODE_ENV = "production";
    process.env.QUEUE_DRIVER = "redis";
    const redis = { isReady: () => false, checkConnection: async () => false } as unknown as RedisService;
    const queue = new QueueService(redis);
    await expect(queue.onModuleInit()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("still rejects an explicit in-memory queue in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.QUEUE_DRIVER = "local";
    const queue = new QueueService({ isReady: () => false, checkConnection: async () => false } as unknown as RedisService);
    await expect(queue.onModuleInit()).rejects.toThrow("QUEUE_DRIVER=local");
  });
});
