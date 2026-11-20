import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export type NotificationKind = "approval.pending" | "routine.failed" | "tool_limit.reached" | "responsibility.result" | "responsibility.disabled";
export interface Notification { id: string; owner: string; kind: NotificationKind; title: string; body: string; details: Record<string, unknown>; createdAt: string; readAt: string | null; }
const COLUMNS = `id, owner, kind, title, body, details, created_at AS "createdAt", read_at AS "readAt"`;

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async create(input: { owner: string; kind: NotificationKind; title: string; body?: string; details?: Record<string, unknown> }): Promise<Notification> {
    const result = await this.database.getPool().query(
      `INSERT INTO notifications(id,owner,kind,title,body,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLUMNS}`,
      [randomUUID(), input.owner, input.kind, input.title.trim().slice(0, 160) || "Notificação", (input.body ?? "").slice(0, 2000), JSON.stringify(input.details ?? {})],
    );
    return result.rows[0] as Notification;
  }

  async listUnread(owner: string, limit = 50): Promise<Notification[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit) || 50, 1), 100);
    const result = await this.database.getPool().query(
      `SELECT ${COLUMNS} FROM notifications WHERE owner=$1 AND read_at IS NULL ORDER BY created_at DESC LIMIT $2`,
      [owner, safeLimit],
    );
    return result.rows as Notification[];
  }

  async markRead(owner: string, id: string): Promise<void> {
    const result = await this.database.getPool().query(`UPDATE notifications SET read_at=now() WHERE id=$1 AND owner=$2 AND read_at IS NULL`, [id, owner]);
    if (!result.rowCount) throw new NotFoundException({ code: "NOT_FOUND", message: "Notificação não encontrada." });
  }

  async markAllRead(owner: string): Promise<number> {
    const result = await this.database.getPool().query(
      `UPDATE notifications SET read_at=now() WHERE owner=$1 AND read_at IS NULL`,
      [owner],
    );
    return result.rowCount ?? 0;
  }
}
