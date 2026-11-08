import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

const MAX_CONTENT = 500;
const MAX_IN_CONTEXT = 20;

/**
 * Memória por pessoa. Hoje só há uma pessoa (`owner` padrão 'local'); o campo já existe para
 * separar as memórias quando houver login por usuário.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly database: DatabaseService) {}

  async isEnabled(owner = "local"): Promise<boolean> {
    const result = await this.database.getPool().query(`SELECT enabled FROM memory_preferences WHERE owner = $1`, [owner]);
    return result.rowCount === 0 ? true : Boolean(result.rows[0].enabled);
  }

  async setEnabled(enabled: boolean, owner = "local"): Promise<boolean> {
    await this.database.getPool().query(
      `INSERT INTO memory_preferences(owner, enabled, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (owner) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [owner, enabled],
    );
    return enabled;
  }

  async list(owner = "local"): Promise<MemoryItem[]> {
    const result = await this.database.getPool().query(
      `SELECT id, content, created_at AS "createdAt" FROM memories WHERE owner = $1 ORDER BY created_at DESC LIMIT 200`,
      [owner],
    );
    return result.rows as MemoryItem[];
  }

  async remember(content: string, owner = "local"): Promise<MemoryItem> {
    const text = content.trim();
    if (!text) throw new BadRequestException({ code: "INVALID_MEMORY", message: "Escreva o que deve ser lembrado." });
    if (text.length > MAX_CONTENT) throw new BadRequestException({ code: "INVALID_MEMORY", message: `Limite de ${MAX_CONTENT} caracteres por memória.` });
    const result = await this.database.getPool().query(
      `INSERT INTO memories(id, owner, content) VALUES ($1,$2,$3) RETURNING id, content, created_at AS "createdAt"`,
      [randomUUID(), owner, text],
    );
    return result.rows[0] as MemoryItem;
  }

  async forget(id: string, owner = "local"): Promise<void> {
    const result = await this.database.getPool().query(`DELETE FROM memories WHERE id = $1 AND owner = $2`, [id, owner]);
    if (result.rowCount === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "Memória não encontrada." });
  }

  /** Trechos para o contexto do chat. Vazio quando a memória está desligada. */
  async contextLines(owner = "local"): Promise<string[]> {
    if (!(await this.isEnabled(owner))) return [];
    const result = await this.database.getPool().query(
      `SELECT content FROM memories WHERE owner = $1 ORDER BY created_at DESC LIMIT $2`,
      [owner, MAX_IN_CONTEXT],
    );
    return result.rows.map((row) => String((row as { content: string }).content));
  }
}
