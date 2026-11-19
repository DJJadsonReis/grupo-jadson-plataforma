import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { Principal } from "../auth/users.service";

export type AgentAccess = "owner" | "editor" | "user" | "none";
export type ShareRole = "editor" | "user";
export interface AgentShareRecord { agentId: string; userId: string | null; userName: string | null; teamId: string | null; teamName: string | null; role: ShareRole; createdAt: string; }

/** Database-backed access decisions for bots and administrator-managed teams. */
@Injectable()
export class AgentPermissionsService {
  constructor(private readonly database: DatabaseService) {}

  async access(agentId: string, principal: Principal): Promise<AgentAccess> {
    const result = await this.database.getPool().query(
      `SELECT a.owner_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM agent_shares s WHERE s.agent_id=a.id AND s.role='editor' AND (
            (s.user_id::text=$2 AND EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.active=true)) OR
            (s.team_id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id::text=$2 AND u.active=true))
          )
        ) THEN 'editor'
        WHEN EXISTS (
          SELECT 1 FROM agent_shares s WHERE s.agent_id=a.id AND s.role='user' AND (
            (s.user_id::text=$2 AND EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.active=true)) OR
            (s.team_id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id::text=$2 AND u.active=true))
          )
        ) THEN 'user' ELSE 'none' END AS shared_role
       FROM agents a WHERE a.id=$1`, [agentId, principal.id]);
    const row = result.rows[0] as { owner_id: string; shared_role: AgentAccess } | undefined;
    if (!row) return "none";
    if (row.owner_id === principal.id) return "owner";
    // Legacy profiles remain usable by everyone, and only global admins may manage them.
    if (row.owner_id === "sistema") return principal.role === "admin" ? "owner" : "user";
    return row.shared_role;
  }

  async assertCanUse(agentId: string, principal: Principal): Promise<AgentAccess> {
    const access = await this.access(agentId, principal);
    if (access === "none") throw new NotFoundException("Agente não encontrado.");
    return access;
  }

  async listAccessible(principal: Principal): Promise<Array<{ id: string; access: Exclude<AgentAccess, "none"> }>> {
    const result = await this.database.getPool().query(
      `SELECT a.id,a.owner_id,
        CASE WHEN EXISTS(SELECT 1 FROM agent_shares s WHERE s.agent_id=a.id AND s.role='editor' AND (
          (s.user_id::text=$1 AND EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.active=true)) OR
          (s.team_id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id::text=$1 AND u.active=true))
        )) THEN 'editor'
        WHEN EXISTS(SELECT 1 FROM agent_shares s WHERE s.agent_id=a.id AND s.role='user' AND (
          (s.user_id::text=$1 AND EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.active=true)) OR
          (s.team_id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id::text=$1 AND u.active=true))
        )) THEN 'user' ELSE 'none' END AS shared_role
       FROM agents a
       WHERE a.owner_id=$1 OR a.owner_id='sistema' OR EXISTS(
         SELECT 1 FROM agent_shares s WHERE s.agent_id=a.id AND (
           (s.user_id::text=$1 AND EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.active=true)) OR
           (s.team_id IN (SELECT tm.team_id FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id::text=$1 AND u.active=true))
         )
       ) ORDER BY a.updated_at DESC`, [principal.id]);
    return (result.rows as Array<{ id: string; owner_id: string; shared_role: AgentAccess }>).map((row) => ({
      id: row.id,
      access: row.owner_id === principal.id || (row.owner_id === "sistema" && principal.role === "admin")
        ? "owner" : row.owner_id === "sistema" ? "user" : row.shared_role as Exclude<AgentAccess, "none">,
    }));
  }

  async listTeams(): Promise<Array<{ id: string; name: string }>> {
    const result = await this.database.getPool().query("SELECT id,name FROM teams ORDER BY lower(name)");
    return result.rows as Array<{ id: string; name: string }>;
  }

  async listPeople(): Promise<Array<{ id: string; name: string }>> {
    const result = await this.database.getPool().query("SELECT id,name FROM users WHERE active=true ORDER BY lower(name)");
    return result.rows as Array<{ id: string; name: string }>;
  }

  async listTeamMembers(teamId: string, principal: Principal): Promise<Array<{ id: string; name: string; role: string }>> {
    this.assertGlobalAdmin(principal);
    const result = await this.database.getPool().query(
      `SELECT u.id,u.name,u.role FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 ORDER BY lower(u.name)`, [teamId],
    );
    return result.rows as Array<{ id: string; name: string; role: string }>;
  }

  async listShares(agentId: string, principal: Principal): Promise<AgentShareRecord[]> {
    await this.assertCanManageShares(agentId, principal);
    const result = await this.database.getPool().query(
      `SELECT s.agent_id AS "agentId",s.user_id AS "userId",u.name AS "userName",s.team_id AS "teamId",t.name AS "teamName",s.role,s.created_at AS "createdAt"
       FROM agent_shares s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN teams t ON t.id=s.team_id
       WHERE s.agent_id=$1 ORDER BY COALESCE(u.name,t.name)`, [agentId],
    );
    return result.rows as AgentShareRecord[];
  }

  async assertCanEdit(agentId: string, principal: Principal): Promise<void> {
    const access = await this.assertCanUse(agentId, principal);
    if (access !== "owner" && access !== "editor") throw new ForbiddenException("Você não pode editar este agente.");
  }

  async assertCanDelete(agentId: string, principal: Principal): Promise<void> {
    const access = await this.assertCanUse(agentId, principal);
    if (access !== "owner") throw new ForbiddenException("Somente o dono pode excluir este agente.");
  }

  async assertCanManageShares(agentId: string, principal: Principal): Promise<void> {
    const result = await this.database.getPool().query("SELECT owner_id FROM agents WHERE id=$1", [agentId]);
    if (!result.rows[0]) throw new NotFoundException("Agente não encontrado.");
    const ownerId = (result.rows[0] as { owner_id: string }).owner_id;
    if (ownerId !== principal.id && !(ownerId === "sistema" && principal.role === "admin")) {
      throw new ForbiddenException("Somente o dono pode compartilhar este agente.");
    }
  }

  async createTeam(name: string, principal: Principal): Promise<{ id: string; name: string }> {
    this.assertGlobalAdmin(principal);
    const result = await this.database.getPool().query(
      "INSERT INTO teams(id,name,created_by) VALUES($1,$2,$3) RETURNING id,name", [randomUUID(), name.trim(), principal.id],
    );
    return result.rows[0] as { id: string; name: string };
  }

  async addTeamMember(teamId: string, userId: string, principal: Principal): Promise<void> {
    this.assertGlobalAdmin(principal);
    const result = await this.database.getPool().query(
      `INSERT INTO team_members(team_id,user_id,added_by)
       SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM teams WHERE id=$1)
         AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND active=true)
       ON CONFLICT(team_id,user_id) DO UPDATE SET added_by=EXCLUDED.added_by RETURNING team_id`, [teamId, userId, principal.id],
    );
    if (!result.rowCount) throw new NotFoundException("Time ou pessoa ativa não encontrada.");
  }

  async removeTeamMember(teamId: string, userId: string, principal: Principal): Promise<void> {
    this.assertGlobalAdmin(principal);
    await this.database.getPool().query("DELETE FROM team_members WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
  }

  async deleteTeam(teamId: string, principal: Principal): Promise<void> {
    this.assertGlobalAdmin(principal);
    const result = await this.database.getPool().query("DELETE FROM teams WHERE id=$1", [teamId]);
    if (!result.rowCount) throw new NotFoundException("Time não encontrado.");
  }

  async grant(agentId: string, target: { userId?: string; teamId?: string }, role: ShareRole, principal: Principal): Promise<void> {
    await this.assertCanManageShares(agentId, principal);
    if (Boolean(target.userId) === Boolean(target.teamId)) throw new NotFoundException("Informe uma pessoa ou um time.");
    const userId = target.userId ?? null;
    const teamId = target.teamId ?? null;
    const result = teamId
      ? await this.database.getPool().query(
        `INSERT INTO agent_shares(agent_id,team_id,role,granted_by)
         SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM agents WHERE id=$1) AND EXISTS(SELECT 1 FROM teams WHERE id=$2)
         ON CONFLICT (agent_id,team_id) DO UPDATE SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by,created_at=now()
         RETURNING agent_id`, [agentId, teamId, role, principal.id],
      )
      : await this.database.getPool().query(
        `INSERT INTO agent_shares(agent_id,user_id,role,granted_by)
         SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM agents WHERE id=$1) AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND active=true)
         ON CONFLICT (agent_id,user_id) DO UPDATE SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by,created_at=now()
         RETURNING agent_id`, [agentId, userId, role, principal.id],
      );
    if (!result.rowCount) throw new NotFoundException("Agente, pessoa ativa ou time não encontrado.");
  }

  async revoke(agentId: string, target: { userId?: string; teamId?: string }, principal: Principal): Promise<void> {
    await this.assertCanManageShares(agentId, principal);
    if (Boolean(target.userId) === Boolean(target.teamId)) throw new NotFoundException("Informe uma pessoa ou um time.");
    await this.database.getPool().query(
      "DELETE FROM agent_shares WHERE agent_id=$1 AND (($2::uuid IS NOT NULL AND user_id=$2) OR ($3::uuid IS NOT NULL AND team_id=$3))",
      [agentId, target.userId ?? null, target.teamId ?? null],
    );
  }

  private assertGlobalAdmin(principal: Principal): void {
    if (principal.role !== "admin") throw new ForbiddenException("Somente administradores globais podem administrar times.");
  }
}
