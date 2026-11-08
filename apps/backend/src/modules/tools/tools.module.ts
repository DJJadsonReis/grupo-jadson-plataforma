import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { MemoryModule } from "../memory/memory.module";
import { ToolsController } from "./tools.controller";
import { ToolsService } from "./tools.service";
import { McpService } from "../mcp/mcp.service";

@Module({
  imports: [DatabaseModule, AuditModule, MemoryModule],
  controllers: [ToolsController],
  providers: [ToolsService, McpService],
  exports: [ToolsService],
})
export class ToolsModule {}
