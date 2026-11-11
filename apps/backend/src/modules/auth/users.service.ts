import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export type Role = "admin" | "operator" | "viewer";
export const ROLES: Role[] = ["admin", "operator", "viewer"];

/** Quem está fazendo a requisição, já autenticado. */
export interface Principal {
  id: string;
  name: string;
  role: Role;
}

export interface UserRecord {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  email: string | null;
  createdAt: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

const COLUMNS = `id, name, role, active, email, created_at AS "createdAt"`;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Pessoas e papéis. Sempre existe pelo menos um administrador ativo. */
@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  /** Cria uma pessoa e devolve o token dela. O token não pode ser recuperado depois. */
  async create(input: { name: string; role: Role; email?: string | null }): Promise<{ user: UserRecord; token: string }> {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new BadRequestException({ code: "INVALID_USER", message: "Informe um nome de até 80 caracteres." });
    if (!ROLES.includes(input.role)) throw new BadRequestException({ code: "INVALID_USER", message: "Papel inválido." });
    const email = input.email ? normalizeEmail(input.email) : null;
    if (input.email && !email) throw new BadRequestException({ code: "INVALID_USER", message: "E-mail inválido." });
    const token = newToken();
    const result = await this.database.getPool().query(
      `INSERT INTO users(id, name, role, token_hash, email) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLUMNS}`,
      [randomUUID(), name, input.role, hashToken(token), email],
    );
    return { user: result.rows[0] as UserRecord, token };
  }

  /** Pessoa ativa cadastrada com este e-mail (login por provedor). */
  async findActiveByEmail(email: string): Promise<Principal | null> {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const result = await this.database.getPool().query(
      `SELECT id, name, role FROM users WHERE lower(email) = $1 AND active = true`,
      [normalized],
    );
    return result.rowCount === 0 ? null : (result.rows[0] as Principal);
  }

  /** Abre uma sessão de 12 horas para a pessoa. Só o hash da sessão fica guardado. */
  async createSession(userId: string, provider: string): Promise<string> {
    const token = newToken();
    await this.database.getPool().query(
      `INSERT INTO auth_sessions(token_hash, user_id, provider, expires_at) VALUES ($1,$2,$3,$4)`,
      [hashToken(token), userId, provider, new Date(Date.now() + SESSION_TTL_MS)],
    );
    return token;
  }

  /** Quem a sessão identifica, se ainda estiver válida e a pessoa estiver ativa. */
  async findBySession(token: string): Promise<Principal | null> {
    if (!token) return null;
    const result = await this.database.getPool().query(
      `SELECT u.id, u.name, u.role FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
      [hashToken(token)],
    );
    return result.rowCount === 0 ? null : (result.rows[0] as Principal);
  }

  async list(): Promise<UserRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM users ORDER BY created_at ASC`);
    return result.rows as UserRecord[];
  }

  /** Quem o token identifica, se a pessoa estiver ativa. */
  async findByToken(token: string): Promise<Principal | null> {
    if (!token) return null;
    const result = await this.database.getPool().query(
      `SELECT id, name, role FROM users WHERE token_hash = $1 AND active = true`,
      [hashToken(token)],
    );
    return result.rowCount === 0 ? null : (result.rows[0] as Principal);
  }

  async setRole(id: string, role: Role): Promise<UserRecord> {
    if (!ROLES.includes(role)) throw new BadRequestException({ code: "INVALID_USER", message: "Papel inválido." });
    await this.guardLastAdmin(id, role !== "admin");
    return this.update(id, "role", role);
  }

  async setActive(id: string, active: boolean): Promise<UserRecord> {
    await this.guardLastAdmin(id, !active);
    return this.update(id, "active", active);
  }

  /** Gera um token novo; o antigo deixa de valer imediatamente. */
  async rotateToken(id: string): Promise<{ user: UserRecord; token: string }> {
    const token = newToken();
    const result = await this.database.getPool().query(
      `UPDATE users SET token_hash = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, hashToken(token)],
    );
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Pessoa não encontrada." });
    return { user: result.rows[0] as UserRecord, token };
  }

  /** Recusa tirar o último administrador ativo, o que deixaria o sistema sem quem o administre. */
  private async guardLastAdmin(id: string, removingAdmin: boolean): Promise<void> {
    if (!removingAdmin) return;
    const result = await this.database.getPool().query(
      `SELECT (SELECT COUNT(*)::int FROM users WHERE role = 'admin' AND active = true AND id <> $1) AS others,
              EXISTS(SELECT 1 FROM users WHERE id = $1 AND role = 'admin' AND active = true) AS is_admin`,
      [id],
    );
    const row = result.rows[0] as { others: number; is_admin: boolean };
    if (row.is_admin && row.others === 0) {
      throw new BadRequestException({ code: "LAST_ADMIN", message: "Não é possível remover o último administrador ativo." });
    }
  }

  private async update(id: string, column: "role" | "active", value: string | boolean): Promise<UserRecord> {
    const result = await this.database.getPool().query(
      `UPDATE users SET ${column} = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, value],
    );
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Pessoa não encontrada." });
    return result.rows[0] as UserRecord;
  }
}
