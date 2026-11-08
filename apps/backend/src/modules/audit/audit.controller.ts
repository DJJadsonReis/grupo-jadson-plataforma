import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApprovalStatus, ApprovalsService } from "./approvals.service";
import { AuditService } from "./audit.service";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query("limit") limit?: string) {
    return this.audit.list(Number(limit ?? 50));
  }
}

@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  list(@Query("status") status?: string) {
    if (status !== undefined && !STATUSES.includes(status as ApprovalStatus)) {
      throw new BadRequestException({ code: "INVALID_STATUS", message: "Status inválido." });
    }
    return this.approvals.list(status as ApprovalStatus | undefined);
  }

  @Post(":id/decision")
  decide(@Param("id") id: string, @Body() body: { decision?: string; decidedBy?: string }) {
    if (body.decision !== "approved" && body.decision !== "rejected") {
      throw new BadRequestException({ code: "INVALID_DECISION", message: "Decisão deve ser 'approved' ou 'rejected'." });
    }
    return this.approvals.decide(id, body.decision, (body.decidedBy ?? "usuario").slice(0, 80));
  }
}
