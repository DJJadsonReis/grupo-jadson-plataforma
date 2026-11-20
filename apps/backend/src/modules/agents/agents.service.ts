import { ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { SecretBox } from "../integrations/secret-box";

export interface AgentRecord {
  id: string; ownerId: string; name: string; description: string; instructions: string; model: string; enabled: boolean;
  avatar: string; role: string; department: string; specialties: string[]; provider: string;
  generationConfig: { temperature?: number; maxTokens?: number }; toolsAllowed: string[];
  providerKind: "model" | "endpoint"; endpointUrl: string | null; hasEndpointToken: boolean; endpointTokenSecret?: string | null;
  modelRouting: AgentModelRouting;
}
export interface AgentModelTarget { providerId: string; model: string }
export interface AgentModelRouting { fallbacks?: AgentModelTarget[]; taskModels?: { vision?: AgentModelTarget; code?: AgentModelTarget } }
export type AgentInput = Pick<AgentRecord, "name" | "description" | "instructions" | "model" | "enabled"> &
  Partial<Pick<AgentRecord, "avatar" | "role" | "department" | "specialties" | "provider" | "generationConfig" | "toolsAllowed" | "providerKind" | "endpointUrl" | "modelRouting">> & { id?: string; endpointToken?: string };
const COLUMNS = `id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,
  generation_config AS "generationConfig",tools_allowed AS "toolsAllowed",owner_id AS "ownerId",provider_kind AS "providerKind",
  endpoint_url AS "endpointUrl",(endpoint_token_secret IS NOT NULL) AS "hasEndpointToken",endpoint_token_secret AS "endpointTokenSecret",model_routing AS "modelRouting"`;

@Injectable()
export class AgentsService {
  private readonly secretBox = new SecretBox();
  constructor(private readonly database: DatabaseService) {}

  private public(record: AgentRecord): AgentRecord {
    const { endpointTokenSecret: _secret, ...safe } = record;
    return { ...safe, ...(record.endpointTokenSecret !== undefined ? { hasEndpointToken: Boolean(record.endpointTokenSecret) } : {}) } as AgentRecord;
  }

  async list(): Promise<AgentRecord[]> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM agents ORDER BY updated_at DESC`);
    return (result.rows as AgentRecord[]).map((row) => this.public(row));
  }

  async get(id: string): Promise<AgentRecord | null> {
    const result = await this.database.getPool().query(`SELECT ${COLUMNS} FROM agents WHERE id=$1`, [id]);
    return result.rows[0] ? this.public(result.rows[0] as AgentRecord) : null;
  }

  async endpointCredentials(id: string): Promise<{ url: string; token?: string } | null> {
    const result = await this.database.getPool().query("SELECT endpoint_url AS url, endpoint_token_secret AS secret FROM agents WHERE id=$1 AND provider_kind='endpoint'", [id]);
    const row = result.rows[0] as { url: string | null; secret: string | null } | undefined;
    if (!row?.url) return null;
    return { url: row.url, ...(row.secret ? { token: this.secretBox.decrypt(row.secret) } : {}) };
  }

  async create(input: AgentInput, ownerId = "sistema"): Promise<AgentRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.database.getPool().query(
      `INSERT INTO agents(id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,generation_config,tools_allowed,owner_id,provider_kind,endpoint_url,endpoint_token_secret,model_routing)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(id) DO NOTHING RETURNING ${COLUMNS}`,
      [id,input.name,input.description,input.instructions,input.model,input.enabled,input.avatar ?? "",input.role ?? "",input.department ?? "",input.specialties ?? [],input.provider ?? "openai",input.generationConfig ?? {},input.toolsAllowed ?? [],ownerId,input.providerKind ?? "model",input.endpointUrl ?? null,input.endpointToken ? this.secretBox.encrypt(input.endpointToken) : null,input.modelRouting ?? {}],
    );
    if (result.rows[0]) return this.public(result.rows[0] as AgentRecord);
    const existing = await this.get(id);
    if (!existing || existing.ownerId !== ownerId) throw new ConflictException("Já existe um agente com este identificador.");
    return existing;
  }

  async update(id: string, input: Partial<Omit<AgentRecord, "id">>): Promise<AgentRecord | null> {
    const result = await this.database.getPool().query(
      `UPDATE agents SET name=COALESCE($2,name),description=COALESCE($3,description),instructions=COALESCE($4,instructions),
       model=COALESCE($5,model),enabled=COALESCE($6,enabled),avatar=COALESCE($7,avatar),role=COALESCE($8,role),
       department=COALESCE($9,department),specialties=COALESCE($10,specialties),provider=COALESCE($11,provider),
       generation_config=COALESCE($12,generation_config),tools_allowed=COALESCE($13,tools_allowed),provider_kind=COALESCE($14,provider_kind),
       endpoint_url=CASE WHEN $14='model' THEN NULL ELSE COALESCE($15,endpoint_url) END,
       endpoint_token_secret=CASE WHEN $14='model' THEN NULL ELSE COALESCE($16,endpoint_token_secret) END,
       model_routing=COALESCE($17,model_routing),updated_at=now()
       WHERE id=$1 RETURNING ${COLUMNS}`,
      [id,input.name ?? null,input.description ?? null,input.instructions ?? null,input.model ?? null,input.enabled ?? null,
        input.avatar ?? null,input.role ?? null,input.department ?? null,input.specialties ?? null,input.provider ?? null,
        input.generationConfig ?? null,input.toolsAllowed ?? null,input.providerKind ?? null,input.endpointUrl ?? null,
        (input as Partial<AgentInput>).endpointToken ? this.secretBox.encrypt((input as Partial<AgentInput>).endpointToken!) : null,input.modelRouting ?? null],
    );
    return result.rows[0] ? this.public(result.rows[0] as AgentRecord) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.database.getPool().query("DELETE FROM agents WHERE id=$1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
