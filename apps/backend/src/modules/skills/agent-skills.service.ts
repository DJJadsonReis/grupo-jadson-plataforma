import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SkillRecord } from "./skills.service";

export const SKILL_LIMIT = 5;
const NOT_FOUND = { code: "SKILL_NOT_FOUND", message: "Habilidade não encontrada." };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = `s.id,s.owner_id AS "ownerId",s.slug,s.title,s.summary,s.instructions,
  s.created_at AS "createdAt",s.updated_at AS "updatedAt"`;

@Injectable()
export class AgentSkillsService {
  constructor(private readonly database: DatabaseService) {}

  async listForAgent(ownerId: string, agentId: string): Promise<SkillRecord[]> {
    if (!UUID_PATTERN.test(agentId)) throw new NotFoundException(NOT_FOUND);
    const result = await this.database.getPool().query(
      `SELECT ${COLUMNS} FROM agent_skills link JOIN agents a ON a.id=link.agent_id
       JOIN skills s ON s.id=link.skill_id
       WHERE link.agent_id=$1 AND link.owner_id=$2 AND a.owner_id=$2 AND s.owner_id=$2
       ORDER BY link.created_at ASC, s.id ASC`, [agentId, ownerId],
    );
    return result.rows as SkillRecord[];
  }

  async attach(ownerId: string, agentId: string, slug: string): Promise<SkillRecord> {
    if (!UUID_PATTERN.test(agentId)) throw new NotFoundException(NOT_FOUND);
    const pool = this.database.getPool();
    const eligible = await pool.query(
      `SELECT ${COLUMNS} FROM agents a CROSS JOIN skills s
       WHERE a.id=$1 AND a.owner_id=$2 AND s.owner_id=$2 AND s.slug=$3`, [agentId, ownerId, slug],
    );
    const skill = eligible.rows[0] as SkillRecord | undefined;
    if (!skill) throw new NotFoundException(NOT_FOUND);

    const existing = await pool.query(
      `SELECT ${COLUMNS} FROM agent_skills link JOIN skills s ON s.id=link.skill_id
       WHERE link.agent_id=$1 AND link.skill_id=$2 AND link.owner_id=$3`, [agentId, skill.id, ownerId],
    );
    if (existing.rows[0]) return existing.rows[0] as SkillRecord;

    const count = await pool.query(
      "SELECT count(*)::int AS count FROM agent_skills WHERE agent_id=$1 AND owner_id=$2", [agentId, ownerId],
    );
    if (Number((count.rows[0] as { count: number | string } | undefined)?.count ?? 0) >= SKILL_LIMIT) {
      throw new BadRequestException({ code: "SKILL_LIMIT", message: "Este bot já atingiu o limite de 5 habilidades." });
    }

    const inserted = await pool.query(
      `INSERT INTO agent_skills(agent_id,skill_id,owner_id)
       SELECT a.id,s.id,$2 FROM agents a CROSS JOIN skills s
       WHERE a.id=$1 AND a.owner_id=$2 AND s.id=$3 AND s.owner_id=$2
       ON CONFLICT(agent_id,skill_id) DO NOTHING RETURNING skill_id`, [agentId, ownerId, skill.id],
    );
    if (!inserted.rowCount) {
      const repeated = await pool.query(
        `SELECT ${COLUMNS} FROM agent_skills link JOIN skills s ON s.id=link.skill_id
         WHERE link.agent_id=$1 AND link.skill_id=$2 AND link.owner_id=$3`, [agentId, skill.id, ownerId],
      );
      if (repeated.rows[0]) return repeated.rows[0] as SkillRecord;
      throw new NotFoundException(NOT_FOUND);
    }
    return skill;
  }

  async detach(ownerId: string, agentId: string, slug: string): Promise<void> {
    if (!UUID_PATTERN.test(agentId)) throw new NotFoundException(NOT_FOUND);
    const result = await this.database.getPool().query(
      `DELETE FROM agent_skills link USING agents a, skills s
       WHERE link.agent_id=$1 AND link.owner_id=$2 AND a.id=link.agent_id AND a.owner_id=$2
         AND s.id=link.skill_id AND s.owner_id=$2 AND s.slug=$3 RETURNING link.skill_id`, [agentId, ownerId, slug],
    );
    if (!result.rowCount) throw new NotFoundException(NOT_FOUND);
  }

  async loadPromptSkills(agentId: string): Promise<Array<{ title: string; instructions: string }>> {
    const result = await this.database.getPool().query(
      `SELECT s.title,s.instructions FROM agent_skills link JOIN skills s ON s.id=link.skill_id
       WHERE link.agent_id=$1 ORDER BY link.created_at ASC, s.id ASC`, [agentId],
    );
    return result.rows as Array<{ title: string; instructions: string }>;
  }
}
