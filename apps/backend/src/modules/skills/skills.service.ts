import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { Principal } from "../auth/users.service";
import { findTool } from "../tools/tools.registry";

export interface SkillRecord {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  global: boolean;
  tools: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillInput {
  slug: unknown;
  title: unknown;
  summary?: unknown;
  instructions: unknown;
  global?: unknown;
  tools?: unknown;
}

const COLUMNS = `id,owner_id AS "ownerId",slug,title,summary,instructions,global,tools,created_at AS "createdAt",updated_at AS "updatedAt"`;

@Injectable()
export class SkillsService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal: Principal): Promise<SkillRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT ${COLUMNS} FROM skills WHERE owner_id=$1 OR global ORDER BY created_at DESC`, [principal.id],
    );
    return result.rows as SkillRecord[];
  }

  async create(principal: Principal, input: SkillInput): Promise<SkillRecord> {
    const validated = this.validate(input);
    const global = input?.global === undefined ? false : input.global;
    if (typeof global !== "boolean") throw new BadRequestException({ code: "INVALID_SKILL", message: "Campo global inválido." });
    if (global && principal.role !== "admin") throw new ForbiddenException({ code: "FORBIDDEN", message: "Só administradores criam habilidades globais." });
    try {
      const result = await this.database.getPool().query(
        `INSERT INTO skills(id,owner_id,slug,title,summary,instructions,global,tools) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLUMNS}`,
        [randomUUID(), principal.id, validated.slug, validated.title, validated.summary, validated.instructions, global, validated.tools],
      );
      return result.rows[0] as SkillRecord;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: "SKILL_SLUG_TAKEN", message: "Este slug já está em uso." });
      throw error;
    }
  }

  async remove(principal: Principal, slug: string): Promise<void> {
    const result = await this.database.getPool().query(
      "DELETE FROM skills WHERE slug=$1 AND (owner_id=$2 OR (global AND $3))", [slug, principal.id, principal.role === "admin"],
    );
    if (result.rowCount === 0) throw new NotFoundException({ code: "SKILL_NOT_FOUND", message: "Habilidade não encontrada." });
  }

  private validate(input: SkillInput): { slug: string; title: string; summary: string; instructions: string; tools: string[] } {
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
    const tools = input.tools === undefined ? [] : input.tools;
    if (!Array.isArray(tools) || tools.length > 20 || tools.some((tool) => typeof tool !== "string")) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Campo tools inválido." });
    }
    const uniqueTools = [...new Set(tools as string[])];
    for (const tool of uniqueTools) {
      if (!findTool(tool)) throw new BadRequestException({ code: "INVALID_SKILL", message: `Ferramenta desconhecida: ${tool}.` });
    }
    return { slug: input.slug, title: input.title, summary, instructions: input.instructions, tools: uniqueTools };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}
