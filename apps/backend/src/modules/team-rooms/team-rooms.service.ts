import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { maskSecrets } from "../../common/secret-masking";
import { DatabaseService } from "../database/database.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { AgentRecord } from "../agents/agents.service";
import { Principal } from "../auth/users.service";
import { ProvidersService } from "../providers/providers.service";
import { AuditService } from "../audit/audit.service";
import { ProviderMessage } from "../providers/provider.types";
import { replyAsAgent } from "../agents/agent-reply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_MISSING = { code: "ROOM_NOT_FOUND", message: "Sala não encontrada." };
type Room = { id: string; name: string; created_by: string; created_at: Date; archived: boolean; role?: string };
type Message = { id: string; room_id: string; author_kind: "person" | "bot"; author_id: string; author_name: string; content: string; created_at: Date };

@Injectable()
export class TeamRoomsService {
  constructor(private readonly database: DatabaseService, private readonly permissions: AgentPermissionsService, private readonly providers: ProvidersService, private readonly audit: AuditService) {}

  private pool() { return this.database.getPool(); }
  private validRoomId(id: string): void { if (!UUID.test(id)) throw new NotFoundException(ROOM_MISSING); }
  private validText(text: unknown, max: number, label: string): asserts text is string {
    if (typeof text !== "string" || !text.trim() || text.length > max) throw new BadRequestException({ code: "INVALID_INPUT", message: `${label} deve ter entre 1 e ${max} caracteres.` });
  }
  async list(principal: Principal) {
    const result = await this.pool().query(`SELECT r.id,r.name,r.created_by AS "createdBy",r.created_at AS "createdAt",m.role FROM team_rooms r JOIN team_room_members m ON m.room_id=r.id WHERE m.person_id=$1 AND r.archived=false ORDER BY r.created_at DESC`, [principal.id]);
    return result.rows;
  }
  async create(name: unknown, principal: Principal) {
    this.validText(name, 80, "O nome da sala");
    const count = await this.pool().query("SELECT count(*)::int AS count FROM team_rooms WHERE created_by=$1", [principal.id]);
    if (Number(count.rows[0]?.count ?? 0) >= 200) throw new ConflictException({ code: "ROOM_LIMIT", message: "Limite de 200 salas atingido." });
    const client = await this.pool().connect();
    const id = randomUUID();
    try {
      await client.query("BEGIN");
      const inserted = await client.query("INSERT INTO team_rooms(id,name,created_by) VALUES($1,$2,$3) RETURNING id,name,created_by AS \"createdBy\",created_at AS \"createdAt\",archived", [id, name.trim(), principal.id]);
      await client.query("INSERT INTO team_room_members(room_id,person_id,role) VALUES($1,$2,'admin')", [id, principal.id]);
      await client.query("COMMIT");
      await this.audit.record({ actor: principal.id, action: "team.room.created", subject: id, details: { roomId: id, name: name.trim() } });
      return { ...inserted.rows[0], role: "admin" };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async people() { const result = await this.pool().query("SELECT id,name FROM users WHERE active=true ORDER BY lower(name)"); return result.rows; }
  private async membership(roomId: string, principal: Principal): Promise<{ room: Room; role: string }> {
    this.validRoomId(roomId);
    const result = await this.pool().query(`SELECT r.id,r.name,r.created_by,r.created_at,r.archived,m.role FROM team_rooms r JOIN team_room_members m ON m.room_id=r.id WHERE r.id=$1 AND m.person_id=$2`, [roomId, principal.id]);
    const room = result.rows[0] as Room | undefined;
    if (!room || room.archived) throw new NotFoundException(ROOM_MISSING);
    return { room, role: room.role! };
  }
  async get(roomId: string, principal: Principal) {
    const { room } = await this.membership(roomId, principal);
    const result = await this.pool().query(`SELECT m.person_id AS "personId",u.name,m.role FROM team_room_members m JOIN users u ON u.id=m.person_id WHERE m.room_id=$1 ORDER BY lower(u.name)`, [roomId]);
    return { id: room.id, name: room.name, createdAt: room.created_at, members: result.rows };
  }
  async addMember(roomId: string, personId: unknown, principal: Principal) {
    const { role } = await this.membership(roomId, principal);
    if (role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Somente administradores da sala podem convidar pessoas." });
    if (typeof personId !== "string" || !UUID.test(personId)) throw new BadRequestException({ code: "INVALID_PERSON", message: "Pessoa inválida." });
    const target = await this.pool().query("SELECT id FROM users WHERE id=$1 AND active=true", [personId]);
    if (!target.rowCount) throw new BadRequestException({ code: "INVALID_PERSON", message: "Pessoa inexistente ou inativa." });
    const existing = await this.pool().query("SELECT 1 FROM team_room_members WHERE room_id=$1 AND person_id=$2", [roomId, personId]);
    if (existing.rowCount) return this.get(roomId, principal);
    const count = await this.pool().query("SELECT count(*)::int AS count FROM team_room_members WHERE room_id=$1", [roomId]);
    if (Number(count.rows[0]?.count ?? 0) >= 50) throw new ConflictException({ code: "ROOM_MEMBER_LIMIT", message: "Limite de 50 pessoas atingido." });
    const inserted = await this.pool().query("INSERT INTO team_room_members(room_id,person_id,role) VALUES($1,$2,'member') ON CONFLICT(room_id,person_id) DO NOTHING RETURNING person_id", [roomId, personId]);
    if (inserted.rowCount) await this.audit.record({ actor: principal.id, action: "team.room.member_added", subject: roomId, details: { roomId, personId, role: "member" } });
    return this.get(roomId, principal);
  }
  async removeMember(roomId: string, personId: string, principal: Principal) {
    const { role } = await this.membership(roomId, principal);
    if (!UUID.test(personId)) throw new BadRequestException({ code: "INVALID_PERSON", message: "Pessoa inválida." });
    if (principal.id !== personId && role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Somente administradores podem remover pessoas." });
    const target = await this.pool().query("SELECT role FROM team_room_members WHERE room_id=$1 AND person_id=$2", [roomId, personId]);
    if (target.rows[0]?.role === "admin") {
      if (principal.id !== personId && role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Somente administradores podem remover pessoas." });
      const admins = await this.pool().query("SELECT count(*)::int AS count FROM team_room_members WHERE room_id=$1 AND role='admin'", [roomId]);
      if (Number(admins.rows[0]?.count ?? 0) <= 1) throw new ConflictException({ code: "LAST_ROOM_ADMIN", message: "A sala precisa manter pelo menos um administrador." });
    }
    const removed = await this.pool().query("DELETE FROM team_room_members WHERE room_id=$1 AND person_id=$2 RETURNING person_id", [roomId, personId]);
    if (!removed.rowCount) throw new BadRequestException({ code: "PERSON_NOT_IN_ROOM", message: "A pessoa não participa desta sala." });
    await this.audit.record({ actor: principal.id, action: "team.room.member_removed", subject: roomId, details: { roomId, personId } });
    return { removed: true };
  }
  async messages(roomId: string, principal: Principal) {
    await this.membership(roomId, principal);
    const result = await this.pool().query(`SELECT id,room_id AS "roomId",author_kind AS "authorKind",author_id AS "authorId",author_name AS "authorName",content,created_at AS "createdAt" FROM (SELECT * FROM team_room_messages WHERE room_id=$1 ORDER BY created_at DESC LIMIT 100) recent ORDER BY created_at ASC`, [roomId]);
    return result.rows;
  }
  async send(roomId: string, content: unknown, principal: Principal) {
    this.validText(content, 4000, "A mensagem");
    await this.membership(roomId, principal);
    const client = await this.pool().connect();
    const own = { id: randomUUID(), roomId, authorKind: "person" as const, authorId: principal.id, authorName: principal.name, content, createdAt: new Date() };
    try {
      await client.query("BEGIN");
      const saved = await client.query(`INSERT INTO team_room_messages(id,room_id,author_kind,author_id,author_name,content) VALUES($1,$2,'person',$3,$4,$5) RETURNING id,room_id AS "roomId",author_kind AS "authorKind",author_id AS "authorId",author_name AS "authorName",content,created_at AS "createdAt"`, [own.id, roomId, principal.id, principal.name, content]);
      await client.query("COMMIT");
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [`team-room:${roomId}`]);
      const botMessages: Message[] = [];
      const listed = content.includes("@") ? await this.pool().query(`SELECT id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,generation_config AS "generationConfig",tools_allowed AS "toolsAllowed",owner_id AS "ownerId",provider_kind AS "providerKind",endpoint_url AS "endpointUrl",endpoint_protocol AS "endpointProtocol",endpoint_token_secret AS "endpointTokenSecret",(endpoint_token_secret IS NOT NULL) AS "hasEndpointToken" FROM agents WHERE enabled=true`) : { rows: [] };
      const allBots = listed.rows as AgentRecord[];
      const bots = allBots.filter((bot) => new RegExp(`@${escapeRegExp(bot.name)}(?![\\p{L}\\p{N}_])`, "iu").test(content) &&
        !allBots.some((longer) => longer.name.length > bot.name.length && longer.name.toLocaleLowerCase().startsWith(bot.name.toLocaleLowerCase()) && new RegExp(`@${escapeRegExp(longer.name)}(?![\\p{L}\\p{N}_])`, "iu").test(content)));
      const selected: AgentRecord[] = [];
      for (const bot of bots) {
        if (selected.length >= 2) break;
        if (await this.permissions.access(bot.id, principal) !== "none") selected.push(bot);
      }
      for (const bot of selected) {
        try {
          const history = await this.pool().query(`SELECT author_kind,author_name,content FROM (SELECT * FROM team_room_messages WHERE room_id=$1 ORDER BY created_at DESC LIMIT 20) h ORDER BY created_at ASC`, [roomId]);
          const messages: ProviderMessage[] = [
            { role: "system", content: bot.instructions || `Você é ${bot.name}. Responda na conversa da equipe.` },
            ...(history.rows as Array<{ author_kind: string; author_name: string; content: string }>).map((item) => ({ role: item.author_kind === "bot" ? "assistant" as const : "user" as const, content: item.author_kind === "person" ? `${item.author_name}: ${item.content}` : item.content })),
          ];
          const text = await replyAsAgent({ agent: bot, messages, providers: this.providers, conversationId: roomId });
          await this.saveBot(roomId, bot, text);
          botMessages.push({ id: randomUUID(), room_id: roomId, author_kind: "bot", author_id: bot.id, author_name: bot.name, content: text, created_at: new Date() });
        } catch {
          const text = "Não consegui responder agora.";
          await this.saveBot(roomId, bot, text).catch(() => undefined);
          botMessages.push({ id: randomUUID(), room_id: roomId, author_kind: "bot", author_id: bot.id, author_name: bot.name, content: text, created_at: new Date() });
        }
      }
      const responseMessages = await this.pool().query(`SELECT id,room_id AS "roomId",author_kind AS "authorKind",author_id AS "authorId",author_name AS "authorName",content,created_at AS "createdAt" FROM team_room_messages WHERE room_id=$1 AND id=ANY($2::uuid[]) ORDER BY created_at ASC`, [roomId, [saved.rows[0]?.id ?? own.id, ...botMessages.map((item) => item.id)]]);
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`team-room:${roomId}`]);
      return { messages: responseMessages.rows };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`team-room:${roomId}`]).catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  private async saveBot(roomId: string, bot: AgentRecord, content: string) {
    this.validText(maskSecrets(content).slice(0, 4000), 4000, "A resposta");
    await this.pool().query("INSERT INTO team_room_messages(id,room_id,author_kind,author_id,author_name,content) VALUES($1,$2,'bot',$3,$4,$5)", [randomUUID(), roomId, bot.id, bot.name, maskSecrets(content).slice(0, 4000)]);
  }
}

function escapeRegExp(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
