import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { MemoryModule } from "../memory/memory.module";
import { AgentPoliciesController } from "./agent-policies.controller";
import { AgentPolicyService } from "./agent-policy.service";
import { ToolsController } from "./tools.controller";
import { ToolsService } from "./tools.service";
import { McpService } from "../mcp/mcp.service";
import { McpController } from "../mcp/mcp.controller";
import { IntegrationsModule } from "../integrations/integrations.module";
import { GoogleModule } from "../google/google.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConnectionSharesModule } from "../connection-shares/connection-shares.module";
import { HumanSupportModule } from "../human-support/human-support.module";

@Module({
  imports: [DatabaseModule, AuditModule, MemoryModule, IntegrationsModule, GoogleModule, NotificationsModule, ConnectionSharesModule, HumanSupportModule],
  controllers: [ToolsController, AgentPoliciesController, McpController],
  providers: [ToolsService, McpService, AgentPolicyService],
  exports: [ToolsService, AgentPolicyService],
})
export class ToolsModule {}
