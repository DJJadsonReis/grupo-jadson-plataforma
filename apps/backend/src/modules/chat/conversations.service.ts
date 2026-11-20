import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { AuditService } from "../audit/audit.service";
import { isOperationMode, OperationMode } from "../tools/operation-modes";
import { ReasoningEffort } from "./model-effort";

export type StoredRole = "system" | "user" | "assistant";
export interface StoredAttachment { id: string; name: string; type: string; size: number; dataUrl: string; }
export interface StoredMessage { id: string; role: StoredRole; content: string; createdAt: string; agentId?: string | null; attachments?: StoredAttachment[]; mentions?: { agentId: string; agentName: string; start: number; end: number }[]; error?: string; }
export interface StoredConversation { id: string; title: string; agentId?: string | null; groupId?: string | null; reasoningEffort?: ReasoningEffort | null; messages: StoredMessage[]; createdAt: string; updatedAt: string; }
export interface OperationModeState { mode: OperationMode; inherited: boolean; }

@Injectable()
export class ConversationsService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  async list(ownerId = "sistema"): Promise<StoredConversation[]> {
    const pool = this.database.getPool();
    const result = await pool.query(`SELECT c.id,c.title,c.agent_id AS "agentId",c.group_id AS "groupId",c.operation_mode AS "operationMode",c.reasoning_effort AS "reasoningEffort",c.created_at AS "createdAt",c.updated_at AS "updatedAt",
      COALESCE(json_agg(json_build_object('id',m.id,'role',m.role,'content',m.content,'createdAt',m.created_at,'agentId',m.agent_id,'attachments',m.attachments,'mentions',m.mentions) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL),'[]') AS messages
      FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.owner_id=$1 GROUP BY c.id ORDER BY c.updated_at DESC`, [ownerId]);
    return result.rows as StoredConversation[];
  }

  async reasoningEffort(id: string, ownerId: string): Promise<{ effort: ReasoningEffort | null }> {
    const result = await this.database.getPool().query("SELECT reasoning_effort AS effort FROM conversations WHERE id=$1 AND owner_id=$2", [id, ownerId]);
    if (!result.rows[0]) throw new NotFoundException("Conversa não encontrada.");
    return { effort: result.rows[0].effort as ReasoningEffort | null };
  }

  async setReasoningEffort(id: string, ownerId: string, effort: unknown): Promise<{ effort: ReasoningEffort | null }> {
    if (effort !== null && effort !== "baixo" && effort !== "medio" && effort !== "alto") throw new ConflictException("Nível de esforço inválido.");
    const result = await this.database.getPool().query("UPDATE conversations SET reasoning_effort=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id", [id, ownerId, effort]);
    if (!result.rowCount) throw new NotFoundException("Conversa não encontrada.");
    return { effort };
  }

  async operationMode(id: string, ownerId: string): Promise<OperationModeState> {
    const result = await this.database.getPool().query(
      `SELECT c.operation_mode AS "operationMode", COALESCE(c.operation_mode,a.default_operation_mode,'automatico') AS mode
       FROM conversations c LEFT JOIN agents a ON a.id=c.agent_id WHERE c.id=$1 AND c.owner_id=$2`, [id, ownerId],
    );
    if (!result.rows[0]) throw new NotFoundException("Conversa não encontrada.");
    return { mode: result.rows[0].mode as OperationMode, inherited: result.rows[0].operationMode === null };
  }

  async isPersisted(id: string, ownerId: string): Promise<boolean> {
    const result = await this.database.getPool().query("SELECT 1 FROM conversations WHERE id=$1 AND owner_id=$2", [id, ownerId]);
    return Boolean(result.rowCount);
  }

  async setOperationMode(id: string, ownerId: string, mode: unknown, role: string, actor: string, confirmation?: unknown): Promise<OperationModeState> {
    if (!isOperationMode(mode)) throw new ConflictException("Modo de operação inválido.");
    if (mode === "ignorar_permissoes" && role !== "admin") throw new ForbiddenException({ code: "ADMIN_REQUIRED", message: "Somente administradores podem ignorar permissões." });
    if (mode === "ignorar_permissoes" && confirmation !== "IGNORAR PERMISSÕES") throw new ConflictException({ code: "CONFIRMATION_REQUIRED", message: "Confirme digitando IGNORAR PERMISSÕES." });
    const result = await this.database.getPool().query(
      `UPDATE conversations SET operation_mode=$3, updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId, mode],
    );
    if (!result.rowCount) throw new NotFoundException("Conversa não encontrada.");
    if (mode === "ignorar_permissoes") await this.audit.record({ actor, action: "operation_mode.activated", subject: id, details: { conversationId: id, mode } });
    return { mode, inherited: false };
  }

  /** Apaga a conversa de vez; mensagens e passagens de bastão vão junto (ON DELETE CASCADE). */
  async remove(id: string, ownerId = "sistema"): Promise<boolean> {
    const result = await this.database.getPool().query("DELETE FROM conversations WHERE id=$1 AND owner_id=$2", [id, ownerId]);
    return (result.rowCount ?? 0) > 0;
  }

  async create(id: string, title: string, agentId?: string, groupId?: string, ownerId = "sistema"): Promise<{ id: string; title: string; agentId?: string | null }> {
    const result = await this.database.getPool().query(
      `INSERT INTO conversations(id,title,agent_id,group_id,conversation_type,owner_id) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET updated_at=now(),agent_id=COALESCE(EXCLUDED.agent_id,conversations.agent_id),group_id=COALESCE(EXCLUDED.group_id,conversations.group_id)
       WHERE conversations.owner_id=EXCLUDED.owner_id RETURNING id,title,agent_id AS "agentId"`,
      [id || randomUUID(), title.slice(0, 120) || "Nova conversa", agentId ?? null, groupId ?? null, groupId ? "group" : "individual", ownerId],
    );
    if (!result.rows[0]) throw new ConflictException("Este identificador de conversa pertence a outro principal.");
    return result.rows[0] as { id: string; title: string; agentId?: string | null };
  }

  async setTitleForFirstResponse(conversationId: string, title: string, ownerId = "sistema"): Promise<boolean> {
    const clean = title.trim().slice(0, 80);
    if (!clean) return false;
    const result = await this.database.getPool().query(
      `UPDATE conversations SET title = $2, updated_at = now()
       WHERE id = $1 AND owner_id=$3 AND NOT EXISTS (
         SELECT 1 FROM messages WHERE conversation_id = $1 AND role = 'assistant'
       )`,
      [conversationId, clean, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async addMessage(conversationId: string, role: StoredRole, content: string, options: { agentId?: string; attachments?: StoredAttachment[]; mentions?: { agentId: string; agentName: string; start: number; end: number }[] } = {}, ownerId = "sistema"): Promise<StoredMessage> {
    const pool = this.database.getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const conversation = await client.query("SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 FOR UPDATE", [conversationId, ownerId]);
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
