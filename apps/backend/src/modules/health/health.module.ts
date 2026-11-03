import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "../database/database.module";
import { RedisModule } from "../redis/redis.module";
import { QueueModule } from "../queue/queue.module";

@Module({ imports: [DatabaseModule, RedisModule, QueueModule], controllers: [HealthController] })
export class HealthModule {}
