import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export interface AgentRecord { id: string; name: string; description: string; instructions: string; model: string; enabled: boolean; }

@Injectable()
export class AgentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<AgentRecord[]> {
    const result = await this.database.getPool().query("SELECT id, name, description, instructions, model, enabled FROM agents ORDER BY updated_at DESC");
    return result.rows as AgentRecord[];
  }

  async create(input: Omit<AgentRecord, "id"> & { id?: string }): Promise<AgentRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.database.getPool().query(
      "INSERT INTO agents(id, name, description, instructions, model, enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id, name, description, instructions, model, enabled",
      [id, input.name, input.description, input.instructions, input.model, input.enabled],
    );
    if (result.rows[0]) return result.rows[0] as AgentRecord;
    const existing = await this.database.getPool().query(
      "SELECT id, name, description, instructions, model, enabled FROM agents WHERE id=$1",
      [id],
    );
    return existing.rows[0] as AgentRecord;
  }

  async update(id: string, input: Partial<Omit<AgentRecord, "id">>): Promise<AgentRecord | null> {
    const result = await this.database.getPool().query(
      `UPDATE agents SET name=COALESCE($2,name), description=COALESCE($3,description), instructions=COALESCE($4,instructions), model=COALESCE($5,model), enabled=COALESCE($6,enabled), updated_at=now() WHERE id=$1 RETURNING id,name,description,instructions,model,enabled`,
      [id, input.name ?? null, input.description ?? null, input.instructions ?? null, input.model ?? null, input.enabled ?? null],
    );
    return (result.rows[0] as AgentRecord | undefined) ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.database.getPool().query("DELETE FROM agents WHERE id=$1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
