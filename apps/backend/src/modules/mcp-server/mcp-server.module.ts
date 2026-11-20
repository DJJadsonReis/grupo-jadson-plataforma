import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TasksModule } from "../tasks/tasks.module";
import { MemoryModule } from "../memory/memory.module";
import { AgentsModule } from "../agents/agents.module";
import { RoutinesModule } from "../routines/routines.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditModule } from "../audit/audit.module";
import { RedisModule } from "../redis/redis.module";
import { QueueModule } from "../queue/queue.module";
import { McpServerController } from "./mcp-server.controller";
import { McpServerTokensService } from "./mcp-server-tokens.service";
import { McpServerTools } from "./mcp-server-tools";

@Module({
  imports: [DatabaseModule, TasksModule, MemoryModule, AgentsModule, RoutinesModule, NotificationsModule, AuditModule, RedisModule, QueueModule],
  controllers: [McpServerController],
  providers: [McpServerTokensService, McpServerTools],
})
export class McpServerModule {}
