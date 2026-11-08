import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ApprovalsController, AuditController } from "./audit.controller";
import { ApprovalsService } from "./approvals.service";
import { AuditService } from "./audit.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController, ApprovalsController],
  providers: [AuditService, ApprovalsService],
  exports: [AuditService, ApprovalsService],
})
export class AuditModule {}
