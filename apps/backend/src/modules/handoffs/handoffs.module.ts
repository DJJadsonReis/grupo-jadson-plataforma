import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { HandoffsController } from "./handoffs.controller";
import { HandoffsService } from "./handoffs.service";

@Module({
  imports: [DatabaseModule, AgentsModule, AuditModule],
  controllers: [HandoffsController],
  providers: [HandoffsService],
  exports: [HandoffsService],
})
export class HandoffsModule {}
