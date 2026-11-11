import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type PolicyDecision = "allow" | "ask" | "deny";
const DECISIONS: PolicyDecision[] = ["allow", "ask", "deny"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentPolicy {
  agentId: string;
  tool: string;
  decision: PolicyDecision;
}

/** Regras por agente. Sem regra, vale o comportamento padrão da ferramenta (ler livre, sensível pede aprovação). */
@Injectable()
export class AgentPolicyService {
  constructor(private readonly database: DatabaseService) {}

  async list(agentId: string): Promise<AgentPolicy[]> {
    const result = await this.database.getPool().query(
      `SELECT agent_id AS "agentId", tool, decision FROM agent_policies WHERE agent_id = $1 ORDER BY tool`,
      [agentId],
    );
    return result.rows as AgentPolicy[];
  }

  async decisionFor(agentId: string, tool: string): Promise<PolicyDecision | null> {
    const result = await this.database.getPool().query(
      `SELECT decision FROM agent_policies WHERE agent_id = $1 AND tool = $2`,
      [agentId, tool],
    );
    return result.rowCount ? ((result.rows[0] as { decision: PolicyDecision }).decision) : null;
  }

  async set(agentId: string, tool: string, decision: string): Promise<AgentPolicy> {
    if (!UUID.test(agentId)) throw new BadRequestException({ code: "INVALID_POLICY", message: "Agente inválido." });
    if (!DECISIONS.includes(decision as PolicyDecision)) {
      throw new BadRequestException({ code: "INVALID_POLICY", message: "Decisão deve ser 'allow', 'ask' ou 'deny'." });
    }
    const agent = await this.database.getPool().query(`SELECT 1 FROM agents WHERE id = $1`, [agentId]);
    if (!agent.rowCount) throw new NotFoundException({ code: "NOT_FOUND", message: "Agente não encontrado." });
    await this.database.getPool().query(
      `INSERT INTO agent_policies(agent_id, tool, decision, updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (agent_id, tool) DO UPDATE SET decision = EXCLUDED.decision, updated_at = now()`,
      [agentId, tool, decision],
    );
    return { agentId, tool, decision: decision as PolicyDecision };
  }

  async remove(agentId: string, tool: string): Promise<void> {
    await this.database.getPool().query(`DELETE FROM agent_policies WHERE agent_id = $1 AND tool = $2`, [agentId, tool]);
  }
}
