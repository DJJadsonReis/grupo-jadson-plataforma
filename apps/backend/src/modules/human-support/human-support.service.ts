import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { maskSecrets } from "../../common/secret-masking";
import { environmentSecrets } from "../../common/secret-masking";
import { DatabaseService } from "../database/database.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { Principal } from "../auth/users.service";

export type HumanSupportStatus = "aberto" | "assumido" | "resolvido";
export interface HumanSupportRequest { id: string; conversationId: string | null; agentId: string | null; requestedBy: string; reason: string; status: HumanSupportStatus; claimedBy: string | null; createdAt: string; claimedAt: string | null; resolvedAt: string | null; }
const COLUMNS = `id, conversation_id AS "conversationId", agent_id AS "agentId", requested_by AS "requestedBy", reason, status, claimed_by AS "claimedBy", created_at AS "createdAt", claimed_at AS "claimedAt", resolved_at AS "resolvedAt"`;

@Injectable()
export class HumanSupportService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  async isAttendant(person: Principal): Promise<boolean> {
    if (person.role === "admin") return true;
    const result = await this.database.getPool().query("SELECT 1 FROM human_support_attendants WHERE user_id=$1", [person.id]);
    return (result.rowCount ?? 0) > 0;
  }
  async list(person: Principal): Promise<HumanSupportRequest[]> {
    await this.assertAttendant(person);
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM human_support_requests WHERE status IN ('aberto','assumido') ORDER BY created_at ASC`);
    return result.rows.map((row) => this.safe(row as HumanSupportRequest));
  }
  async setAttendant(userId: string, enabled: boolean): Promise<void> {
    if (enabled) await this.database.getPool().query("INSERT INTO human_support_attendants(user_id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
    else await this.database.getPool().query("DELETE FROM human_support_attendants WHERE user_id=$1", [userId]);
  }
  async open(input: { conversationId: string | null; agentId: string | null; requestedBy: string; reason: string }): Promise<HumanSupportRequest> {
    const reason = maskSecrets(input.reason.trim().slice(0, 1000), environmentSecrets());
    const id = randomUUID();
    const result = await this.database.getPool().query(`INSERT INTO human_support_requests(id,conversation_id,agent_id,requested_by,reason,status) VALUES($1,$2,$3,$4,$5,'aberto') RETURNING ${COLUMNS}`,
      [id, input.conversationId, input.agentId, input.requestedBy, reason]);
    await this.audit.record({ actor: input.requestedBy, action: "human_support.requested", subject: input.conversationId, details: { requestId: id, reason } });
    const attendants = await this.database.getPool().query("SELECT u.id FROM users u WHERE u.role='admin' AND u.active=true UNION SELECT u.id FROM users u JOIN human_support_attendants h ON h.user_id=u.id WHERE u.active=true");
    await Promise.all(attendants.rows.filter((row: { id: string }) => row.id !== input.requestedBy).map((row: { id: string }) => this.notifications.create({ owner: row.id, kind: "human_support.requested", title: "Atendimento humano solicitado", body: reason.slice(0, 300), details: { requestId: id, conversationId: input.conversationId, requestedBy: input.requestedBy } }).catch(() => undefined)));
    return this.safe(result.rows[0] as HumanSupportRequest);
  }
  async claim(id: string, person: Principal): Promise<HumanSupportRequest> {
    await this.assertAttendant(person);
    const result = await this.database.getPool().query(`UPDATE human_support_requests SET status='assumido',claimed_by=$2,claimed_at=now() WHERE id=$1 AND status='aberto' RETURNING ${COLUMNS}`,[id,person.id]);
    if (!result.rowCount) {
      const exists = await this.database.getPool().query("SELECT status FROM human_support_requests WHERE id=$1",[id]);
      if (!exists.rowCount) throw new NotFoundException({ code:"NOT_FOUND", message:"Pedido de atendimento não encontrado." });
      throw new ConflictException({ code:"ALREADY_CLAIMED", message:"Este pedido já foi assumido por outro atendente." });
    }
    await this.audit.record({ actor: person.id, action:"human_support.claimed", subject:id });
    return this.safe(result.rows[0] as HumanSupportRequest);
  }
  async resolve(id: string, person: Principal): Promise<HumanSupportRequest> {
    await this.assertAttendant(person);
    const result = await this.database.getPool().query(`UPDATE human_support_requests SET status='resolvido',resolved_at=now() WHERE id=$1 AND status='assumido' AND (claimed_by=$2 OR $3='admin') RETURNING ${COLUMNS}`,[id,person.id,person.role]);
    if (!result.rowCount) {
      const exists = await this.database.getPool().query(`SELECT status,claimed_by AS "claimedBy",requested_by AS "requestedBy" FROM human_support_requests WHERE id=$1`,[id]);
      if (!exists.rowCount) throw new NotFoundException({ code:"NOT_FOUND", message:"Pedido de atendimento não encontrado." });
      if ((exists.rows[0] as { status: string }).status === "resolvido") throw new ConflictException({ code:"ALREADY_RESOLVED", message:"Este pedido já foi resolvido." });
      throw new ForbiddenException({ code:"NOT_ASSIGNEE", message:"Somente quem assumiu o pedido ou um administrador pode resolvê-lo." });
    }
    const request = result.rows[0] as HumanSupportRequest;
    await this.audit.record({ actor: person.id, action:"human_support.resolved", subject:id });
    await this.notifications.create({ owner:request.requestedBy, kind:"human_support.requested", title:"Atendimento humano resolvido", body:request.reason.slice(0,300), details:{ requestId:id, conversationId:request.conversationId, resolved:true } }).catch(() => undefined);
    return this.safe(request);
  }
  private async assertAttendant(person: Principal): Promise<void> { if (!(await this.isAttendant(person))) throw new ForbiddenException({ code:"FORBIDDEN", message:"Acesso restrito a atendentes autorizados." }); }
  private safe(request: HumanSupportRequest): HumanSupportRequest { return { ...request, reason: maskSecrets(request.reason, environmentSecrets()) }; }
}
