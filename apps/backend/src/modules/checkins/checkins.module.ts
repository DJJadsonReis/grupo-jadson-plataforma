import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsModule } from "../agents/agents.module";
import { ProvidersModule } from "../providers/providers.module";
import { ToolsModule } from "../tools/tools.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AgentSkillsService } from "../skills/agent-skills.service";
import { CheckinsController } from "./checkins.controller";
import { CheckinsService } from "./checkins.service";
@Module({ imports:[DatabaseModule,AgentsModule,ProvidersModule,ToolsModule,AuditModule,NotificationsModule],controllers:[CheckinsController],providers:[CheckinsService,AgentSkillsService] })
export class CheckinsModule {}
