import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface SkillRecord {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillInput {
  slug: unknown;
  title: unknown;
  summary?: unknown;
  instructions: unknown;
}

const COLUMNS = `id,owner_id AS "ownerId",slug,title,summary,instructions,created_at AS "createdAt",updated_at AS "updatedAt"`;

@Injectable()
export class SkillsService {
  constructor(private readonly database: DatabaseService) {}

  async list(ownerId: string): Promise<SkillRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT ${COLUMNS} FROM skills WHERE owner_id=$1 ORDER BY created_at DESC`, [ownerId],
    );
    return result.rows as SkillRecord[];
  }

  async create(ownerId: string, input: SkillInput): Promise<SkillRecord> {
    const validated = this.validate(input);
    try {
      const result = await this.database.getPool().query(
        `INSERT INTO skills(id,owner_id,slug,title,summary,instructions) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLUMNS}`,
        [randomUUID(), ownerId, validated.slug, validated.title, validated.summary, validated.instructions],
      );
      return result.rows[0] as SkillRecord;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: "SKILL_SLUG_TAKEN", message: "Este slug já está em uso." });
      throw error;
    }
  }

  async remove(ownerId: string, slug: string): Promise<void> {
    const result = await this.database.getPool().query(
      "DELETE FROM skills WHERE owner_id=$1 AND slug=$2", [ownerId, slug],
    );
    if (result.rowCount === 0) throw new NotFoundException({ code: "SKILL_NOT_FOUND", message: "Habilidade não encontrada." });
  }

  private validate(input: SkillInput): { slug: string; title: string; summary: string; instructions: string } {
    if (!input || typeof input !== "object" || typeof input.slug !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(input.slug)) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Slug inválido." });
    }
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 300) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Título inválido." });
    }
    if (typeof input.instructions !== "string" || !input.instructions.trim() || input.instructions.length > 20_000) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Instruções inválidas." });
    }
    const summary = input.summary === undefined ? "" : input.summary;
    if (typeof summary !== "string" || summary.length > 300) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Resumo inválido." });
    }
    return { slug: input.slug, title: input.title, summary, instructions: input.instructions };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}
