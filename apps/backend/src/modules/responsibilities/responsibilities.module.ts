import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsModule } from "../agents/agents.module";
import { ProvidersModule } from "../providers/providers.module";
import { ToolsModule } from "../tools/tools.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AgentSkillsService } from "../skills/agent-skills.service";
import { ResponsibilitiesController } from "./responsibilities.controller";
import { ResponsibilitiesService } from "./responsibilities.service";

@Module({
  imports: [DatabaseModule, AgentsModule, ProvidersModule, ToolsModule, AuditModule, NotificationsModule],
  controllers: [ResponsibilitiesController],
  providers: [ResponsibilitiesService, AgentSkillsService],
})
export class ResponsibilitiesModule {}
