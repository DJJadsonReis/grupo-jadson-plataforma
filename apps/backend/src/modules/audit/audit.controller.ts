import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApprovalStatus, ApprovalsService } from "./approvals.service";
import { AuditService } from "./audit.service";
import { AdminOnly } from "../auth/roles";
import { AuditQueryError, parseAuditFilters } from "./audit-events.query";

type PrincipalRequest = { principal?: { id: string; name: string; role: string } };

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("retention")
  @AdminOnly()
  async retention(@Req() request: PrincipalRequest) {
    this.requireAdmin(request);
    return this.audit.getRetentionSettings();
  }

  @Put("retention")
  @AdminOnly()
  async setRetention(@Body() body: { retentionDays?: unknown }, @Req() request: PrincipalRequest) {
    const principal = this.requireAdmin(request);
    if (!(body.retentionDays === null || (typeof body.retentionDays === "number" && Number.isInteger(body.retentionDays) && body.retentionDays >= 1 && body.retentionDays <= 3650))) {
      throw new BadRequestException({ code: "INVALID_RETENTION_DAYS", message: "Informe um número inteiro entre 1 e 3650 ou null para desligar a retenção." });
    }
    return this.audit.setRetentionDays(body.retentionDays as number | null, principal.name);
  }

  @Post("retention/sweep")
  @AdminOnly()
  async sweepNow(@Req() request: PrincipalRequest) {
    const principal = this.requireAdmin(request);
    return this.audit.sweepConfiguredNow(principal.name);
  }

  private requireAdmin(request: PrincipalRequest) {
    if (request.principal?.role !== "admin") {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Somente administradores podem acessar a retenção da auditoria." });
    }
    return request.principal;
  }

  @Get()
  @AdminOnly()
  list(@Query("limit") limit?: string, @Req() request?: PrincipalRequest) {
    this.requireAuditAdmin(request ?? {});
    return this.audit.list(Number(limit ?? 50));
  }

  @Get("events")
  @AdminOnly()
  events(@Query() query: Record<string, unknown>, @Req() request: PrincipalRequest) {
    this.requireAuditAdmin(request);
    try { return this.audit.search(parseAuditFilters(query)); }
    catch (error) {
      if (error instanceof AuditQueryError) throw new BadRequestException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private requireAuditAdmin(request: PrincipalRequest) {
    if (request.principal?.role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Somente administradores podem acessar a auditoria." });
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

  /** Quem decide é quem se autenticou; o nome enviado no corpo não é confiável. */
  @Post(":id/decision")
  decide(@Param("id") id: string, @Body() body: { decision?: string }, @Req() request: { principal?: { name: string } }) {
    if (body.decision !== "approved" && body.decision !== "rejected") {
      throw new BadRequestException({ code: "INVALID_DECISION", message: "Decisão deve ser 'approved' ou 'rejected'." });
    }
    return this.approvals.decide(id, body.decision, (request.principal?.name ?? "usuario").slice(0, 80));
  }
}
