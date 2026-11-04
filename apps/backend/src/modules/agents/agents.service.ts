import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface AgentRecord {
  id: string; name: string; description: string; instructions: string; model: string; enabled: boolean;
  avatar: string; role: string; department: string; specialties: string[]; provider: string;
  generationConfig: { temperature?: number; maxTokens?: number }; toolsAllowed: string[];
}
export type AgentInput = Pick<AgentRecord, "name" | "description" | "instructions" | "model" | "enabled"> &
  Partial<Pick<AgentRecord, "avatar" | "role" | "department" | "specialties" | "provider" | "generationConfig" | "toolsAllowed">> & { id?: string };
const COLUMNS = `id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,
  generation_config AS "generationConfig",tools_allowed AS "toolsAllowed"`;

@Injectable()
export class AgentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<AgentRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM agents ORDER BY updated_at DESC`);
    return result.rows as AgentRecord[];
  }

  async get(id: string): Promise<AgentRecord | null> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM agents WHERE id=$1`, [id]);
    return (result.rows[0] as AgentRecord | undefined) ?? null;
  }

  async create(input: AgentInput): Promise<AgentRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.database.getPool().query(
      `INSERT INTO agents(id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,generation_config,tools_allowed)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING RETURNING ${COLUMNS}`,
      [id,input.name,input.description,input.instructions,input.model,input.enabled,input.avatar ?? "",input.role ?? "",input.department ?? "",input.specialties ?? [],input.provider ?? "openai",input.generationConfig ?? {},input.toolsAllowed ?? []],
    );
    if (result.rows[0]) return result.rows[0] as AgentRecord;
    return (await this.get(id))!;
  }

  async update(id: string, input: Partial<Omit<AgentRecord, "id">>): Promise<AgentRecord | null> {
    const result = await this.database.getPool().query(
      `UPDATE agents SET name=COALESCE($2,name),description=COALESCE($3,description),instructions=COALESCE($4,instructions),
       model=COALESCE($5,model),enabled=COALESCE($6,enabled),avatar=COALESCE($7,avatar),role=COALESCE($8,role),
       department=COALESCE($9,department),specialties=COALESCE($10,specialties),provider=COALESCE($11,provider),
       generation_config=COALESCE($12,generation_config),tools_allowed=COALESCE($13,tools_allowed),updated_at=now()
       WHERE id=$1 RETURNING ${COLUMNS}`,
      [id,input.name ?? null,input.description ?? null,input.instructions ?? null,input.model ?? null,input.enabled ?? null,
        input.avatar ?? null,input.role ?? null,input.department ?? null,input.specialties ?? null,input.provider ?? null,
        input.generationConfig ?? null,input.toolsAllowed ?? null],
    );
    return (result.rows[0] as AgentRecord | undefined) ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.database.getPool().query("DELETE FROM agents WHERE id=$1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
