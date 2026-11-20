import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { TaskQueueService } from "./task-queue.service";
import { AgentsModule } from "../agents/agents.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuditModule } from "../audit/audit.module";
import { ProvidersModule } from "../providers/providers.module";
import { ToolsModule } from "../tools/tools.module";

@Module({ imports: [DatabaseModule, AgentsModule, NotificationsModule, AuditModule, ProvidersModule, ToolsModule], controllers: [TasksController], providers: [TasksService, TaskQueueService], exports: [TasksService, TaskQueueService] })
export class TasksModule {}
