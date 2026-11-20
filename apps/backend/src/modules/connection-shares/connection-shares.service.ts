import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { GoogleService } from "../google/google.service";
import { AuditService } from "../audit/audit.service";
import { Principal } from "../auth/users.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING = { code: "SHARE_NOT_FOUND", message: "Compartilhamento não encontrado." };
const DENIED = { code: "CONEXAO_NAO_LIBERADA", message: "Você não tem acesso a esta conexão." };

@Injectable()
export class ConnectionSharesService {
  constructor(private readonly db: DatabaseService, private readonly google: GoogleService, private readonly audit: AuditService) {}

  async list(principal: Principal) {
    const [outgoing, incoming] = await Promise.all([
      this.db.getPool().query(`SELECT u.id,u.name,s.status,s.requested_at AS "requestedAt",s.approved_at AS "approvedAt" FROM google_connection_shares s JOIN users u ON u.id=s.grantee_id WHERE s.owner_id=$1 ORDER BY s.requested_at DESC`, [principal.id]),
      this.db.getPool().query(`SELECT u.id,u.name,s.status,s.requested_at AS "requestedAt",s.approved_at AS "approvedAt" FROM google_connection_shares s JOIN users u ON u.id=s.owner_id JOIN google_connections g ON g.user_id=s.owner_id WHERE s.grantee_id=$1 AND s.status='approved' ORDER BY s.approved_at DESC`, [principal.id]),
    ]);
    return { outgoing: outgoing.rows, incoming: incoming.rows };
  }

  async request(granteeId: unknown, owner: Principal) {
    if (typeof granteeId !== "string" || !UUID.test(granteeId) || granteeId === owner.id) throw new BadRequestException({ code: "INVALID_PERSON", message: "Pessoa inválida." });
    const pool = this.db.getPool();
    const target = await pool.query("SELECT id FROM users WHERE id=$1 AND active=true", [granteeId]);
    if (!target.rowCount) throw new BadRequestException({ code: "INVALID_PERSON", message: "Pessoa inexistente ou inativa." });
    if (!(await this.google.status(owner.id)).connected) throw new BadRequestException({ code: "NO_CONNECTION", message: "Conecte sua conta Google antes de compartilhar." });
    const existing = await pool.query(`SELECT owner_id AS "ownerId",grantee_id AS "granteeId",status,requested_at AS "requestedAt",approved_by AS "approvedBy",approved_at AS "approvedAt" FROM google_connection_shares WHERE owner_id=$1 AND grantee_id=$2`, [owner.id, granteeId]);
    if (existing.rowCount) return existing.rows[0];
    const inserted = await pool.query(`INSERT INTO google_connection_shares(owner_id,grantee_id,status) VALUES($1,$2,'pending') RETURNING owner_id AS "ownerId",grantee_id AS "granteeId",status,requested_at AS "requestedAt",approved_by AS "approvedBy",approved_at AS "approvedAt"`, [owner.id, granteeId]);
    await this.audit.record({ actor: owner.id, action: "connection.share.request", subject: owner.id, details: { granteeId } });
    return inserted.rows[0];
  }

  async revoke(granteeId: string, actor: Principal, requestedOwnerId?: string) {
    if (!UUID.test(granteeId)) throw new NotFoundException(MISSING);
    const pool = this.db.getPool();
    const ownerId = requestedOwnerId ?? actor.id;
    if (!UUID.test(ownerId)) throw new NotFoundException(MISSING);
    if (ownerId !== actor.id && actor.role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Você não pode revogar este compartilhamento." });
    const row = await pool.query(`SELECT owner_id AS "ownerId" FROM google_connection_shares WHERE owner_id=$1 AND grantee_id=$2`, [ownerId, granteeId]);
    if (!row.rowCount) {
      if (actor.role !== "admin") {
        const exists = await pool.query("SELECT 1 FROM google_connection_shares WHERE grantee_id=$1", [granteeId]);
        if (exists.rowCount) throw new ForbiddenException({ code: "FORBIDDEN", message: "Você não pode revogar este compartilhamento." });
      }
      throw new NotFoundException(MISSING);
    }
    await pool.query("DELETE FROM google_connection_shares WHERE owner_id=$1 AND grantee_id=$2", [ownerId, granteeId]);
    await this.audit.record({ actor: actor.id, action: "connection.share.revoke", subject: ownerId, details: { granteeId } });
    return { revoked: true };
  }

  pending() {
    return this.db.getPool().query(`SELECT s.owner_id AS "ownerId",o.name AS "ownerName",s.grantee_id AS "granteeId",g.name AS "granteeName",s.status,s.requested_at AS "requestedAt" FROM google_connection_shares s JOIN users o ON o.id=s.owner_id JOIN users g ON g.id=s.grantee_id WHERE s.status='pending' ORDER BY s.requested_at`).then((r) => r.rows);
  }

  async approve(ownerId: string, granteeId: string, admin: Principal) {
    if (!UUID.test(ownerId) || !UUID.test(granteeId)) throw new NotFoundException(MISSING);
    const pool = this.db.getPool();
    const found = await pool.query("SELECT status,approved_at AS \"approvedAt\" FROM google_connection_shares WHERE owner_id=$1 AND grantee_id=$2", [ownerId, granteeId]);
    if (!found.rowCount) throw new NotFoundException(MISSING);
    if ((found.rows[0] as { status: string }).status === "approved") return found.rows[0];
    const result = await pool.query(`UPDATE google_connection_shares SET status='approved',approved_by=$3,approved_at=now() WHERE owner_id=$1 AND grantee_id=$2 RETURNING owner_id AS "ownerId",grantee_id AS "granteeId",status,approved_by AS "approvedBy",approved_at AS "approvedAt"`, [ownerId, granteeId, admin.id]);
    await this.audit.record({ actor: admin.id, action: "connection.share.approve", subject: ownerId, details: { granteeId } });
    return result.rows[0];
  }

  async resolveOwner(granteeId: string, ownerId: string): Promise<string> {
    const result = await this.db.getPool().query(`SELECT 1 FROM google_connection_shares s JOIN google_connections g ON g.user_id=s.owner_id WHERE s.owner_id=$1 AND s.grantee_id=$2 AND s.status='approved'`, [ownerId, granteeId]);
    if (!result.rowCount) throw new ForbiddenException(DENIED);
    return ownerId;
  }
}
