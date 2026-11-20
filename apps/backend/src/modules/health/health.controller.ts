import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { RedisService } from "../redis/redis.service";
import { QueueService } from "../queue/queue.service";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService, private readonly redis: RedisService, private readonly queue: QueueService) {}

  @Get()
  async check() {
    const [postgresConnected, redisConnected] = await Promise.all([this.database.checkConnection(), this.redis.checkConnection()]);
    return {
      status: "ok",
      application: "Grupo Jadson",
      stage: "development",
      dependencies: {
        postgres: postgresConnected ? "connected" : "unavailable",
        pgvector: this.database.isVectorReady() ? "connected" : "unavailable",
        redis: redisConnected ? "connected" : "unavailable",
        queue: {
          driver: this.queue.getDriver(),
          persistence: this.queue.getDriver() === "redis" ? "redis-configuration-dependent" : "process-memory",
        },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
