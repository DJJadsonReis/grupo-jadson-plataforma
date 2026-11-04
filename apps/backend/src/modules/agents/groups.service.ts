import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";

export type GroupMode = "manual" | "mention" | "coordinated";
export interface GroupRecord { id: string; name: string; avatar: string; description: string; mode: GroupMode; coordinatorId: string | null; archived: boolean; agentIds: string[]; participantRoles: Record<string, string>; createdAt: string; }

@Injectable()
export class GroupsService {
  constructor(private readonly database: DatabaseService) {}
  async list(): Promise<GroupRecord[]> {
    const result = await this.database.getPool().query(`SELECT g.id,g.name,g.avatar,g.description,g.mode,g.coordinator_id AS "coordinatorId",g.archived,g.created_at AS "createdAt",
      COALESCE(array_agg(p.agent_id) FILTER (WHERE p.agent_id IS NOT NULL),'{}') AS "agentIds",COALESCE(json_object_agg(p.agent_id,p.participant_role) FILTER (WHERE p.agent_id IS NOT NULL),'{}'::json) AS "participantRoles"
      FROM agent_groups g LEFT JOIN group_participants p ON p.group_id=g.id WHERE g.archived=false GROUP BY g.id ORDER BY g.updated_at DESC`);
    return result.rows as GroupRecord[];
  }
  async get(id: string): Promise<GroupRecord | null> {
    const result = await this.database.getPool().query(`SELECT g.id,g.name,g.avatar,g.description,g.mode,g.coordinator_id AS "coordinatorId",g.archived,g.created_at AS "createdAt",
      COALESCE(array_agg(p.agent_id) FILTER (WHERE p.agent_id IS NOT NULL),'{}') AS "agentIds",COALESCE(json_object_agg(p.agent_id,p.participant_role) FILTER (WHERE p.agent_id IS NOT NULL),'{}'::json) AS "participantRoles" FROM agent_groups g LEFT JOIN group_participants p ON p.group_id=g.id WHERE g.id=$1 GROUP BY g.id`, [id]);
    return (result.rows[0] as GroupRecord | undefined) ?? null;
  }
  async save(input: { id?: string; name: string; avatar: string; description: string; mode: GroupMode; coordinatorId: string | null; agentIds: string[]; participantRoles?: Record<string, string> }): Promise<GroupRecord> {
    const pool = this.database.getPool(); const client = await pool.connect(); const id = input.id ?? randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO agent_groups(id,name,avatar,description,mode,coordinator_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,now())
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,avatar=EXCLUDED.avatar,description=EXCLUDED.description,mode=EXCLUDED.mode,coordinator_id=EXCLUDED.coordinator_id,updated_at=now()`,
        [id,input.name,input.avatar,input.description,input.mode,input.coordinatorId]);
      await client.query("DELETE FROM group_participants WHERE group_id=$1", [id]);
      for (const agentId of new Set(input.agentIds)) await client.query("INSERT INTO group_participants(group_id,agent_id,participant_role) VALUES($1,$2,$3)", [id,agentId,input.participantRoles?.[agentId] ?? ""]);
      await client.query("COMMIT");
      const saved = await pool.query(`SELECT g.id,g.name,g.avatar,g.description,g.mode,g.coordinator_id AS "coordinatorId",g.archived,g.created_at AS "createdAt",
        COALESCE(array_agg(p.agent_id) FILTER (WHERE p.agent_id IS NOT NULL),'{}') AS "agentIds",COALESCE(json_object_agg(p.agent_id,p.participant_role) FILTER (WHERE p.agent_id IS NOT NULL),'{}'::json) AS "participantRoles" FROM agent_groups g LEFT JOIN group_participants p ON p.group_id=g.id WHERE g.id=$1 GROUP BY g.id`, [id]);
      return saved.rows[0] as GroupRecord;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async archive(id: string): Promise<void> {
    const result = await this.database.getPool().query("UPDATE agent_groups SET archived=true,updated_at=now() WHERE id=$1", [id]);
    if (!result.rowCount) throw new NotFoundException("Grupo não encontrado.");
  }
}
