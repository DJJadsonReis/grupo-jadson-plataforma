import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export type StoredRole = "system" | "user" | "assistant";
export interface StoredAttachment { id: string; name: string; type: string; size: number; dataUrl: string; }
export interface StoredMessage { id: string; role: StoredRole; content: string; createdAt: string; agentId?: string | null; attachments?: StoredAttachment[]; mentions?: { agentId: string; agentName: string; start: number; end: number }[]; }
export interface StoredConversation { id: string; title: string; agentId?: string | null; groupId?: string | null; messages: StoredMessage[]; createdAt: string; updatedAt: string; }

@Injectable()
export class ConversationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<StoredConversation[]> {
    const pool = this.database.getPool();
    const result = await pool.query(`SELECT c.id,c.title,c.agent_id AS "agentId",c.group_id AS "groupId",c.created_at AS "createdAt",c.updated_at AS "updatedAt",
      COALESCE(json_agg(json_build_object('id',m.id,'role',m.role,'content',m.content,'createdAt',m.created_at,'agentId',m.agent_id,'attachments',m.attachments,'mentions',m.mentions) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL),'[]') AS messages
      FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC`);
    return result.rows as StoredConversation[];
  }

  async create(id: string, title: string, agentId?: string, groupId?: string): Promise<{ id: string; title: string; agentId?: string | null }> {
    const result = await this.database.getPool().query(
      "INSERT INTO conversations(id,title,agent_id,group_id,conversation_type) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET updated_at=now(), agent_id=COALESCE(EXCLUDED.agent_id,conversations.agent_id), group_id=COALESCE(EXCLUDED.group_id,conversations.group_id) RETURNING id,title,agent_id AS \"agentId\"",
      [id || randomUUID(), title.slice(0, 120) || "Nova conversa", agentId ?? null, groupId ?? null, groupId ? "group" : "individual"],
    );
    return result.rows[0] as { id: string; title: string; agentId?: string | null };
  }

  async addMessage(conversationId: string, role: StoredRole, content: string, options: { agentId?: string; attachments?: StoredAttachment[]; mentions?: { agentId: string; agentName: string; start: number; end: number }[] } = {}): Promise<StoredMessage> {
    const pool = this.database.getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const conversation = await client.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [conversationId]);
      if (!conversation.rowCount) throw new NotFoundException("Conversa não encontrada.");
      const id = randomUUID();
      const result = await client.query(
        "INSERT INTO messages(id,conversation_id,role,content,agent_id,attachments,mentions) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,role,content,created_at AS \"createdAt\",agent_id AS \"agentId\",attachments,mentions",
        [id, conversationId, role, content, options.agentId ?? null, options.attachments ?? [], options.mentions ?? []],
      );
      await client.query("UPDATE conversations SET updated_at=now(), title=CASE WHEN title='Nova conversa' AND $2='user' THEN left($3,120) ELSE title END WHERE id=$1", [conversationId, role, content]);
      await client.query("COMMIT");
      return result.rows[0] as StoredMessage;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}
