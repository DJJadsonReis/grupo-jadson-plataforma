import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { maskSecrets } from "../../common/secret-masking";
import { AuditService } from "../audit/audit.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { AgentRecord, AgentsService } from "../agents/agents.service";
import { replyAsAgent } from "../agents/agent-reply";
import { Principal } from "../auth/users.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ProvidersService } from "../providers/providers.service";
import { ToolsService } from "../tools/tools.service";

export const TASK_QUEUE_LEASE_MS = 5 * 60_000;
const FAILURE = "Não foi possível concluir a tarefa com o bot. Tente de novo.";
type ClaimedTask = { id: string; ownerId: string; title: string; description: string; agentId: string; claimToken: string; attempts: number };

@Injectable()
export class TaskQueueService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly database: DatabaseService, private readonly permissions: AgentPermissionsService,
    private readonly agents: AgentsService, private readonly providers: ProvidersService, private readonly tools: ToolsService,
    private readonly notifications: NotificationsService, private readonly audit: AuditService) {}

  onModuleInit(): void {
    if (process.env.TASK_QUEUE_WORKER === "off") return;
    this.timer = setInterval(() => void this.runOnce(), 15_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async enqueue(ownerId: string, taskId: string, agentId: string): Promise<unknown> {
    const task = await this.ownedTask(ownerId, taskId);
    if (task.status !== "aberta" && task.status !== "falhou") throw new ConflictException("Só é possível enviar uma tarefa aberta ou com falha.");
    const selectedAgent = await this.agents.get(agentId);
    if (!selectedAgent || !selectedAgent.enabled) throw new NotFoundException("Agente não encontrado.");
    const principal = await this.principal(ownerId);
    const access = await this.permissions.assertCanUse(agentId, principal);
    if (access === "none") throw new ForbiddenException("Você não tem acesso a esse bot.");
    const result = await this.database.getPool().query(
      `UPDATE tasks SET agent_id=$3,status='na_fila',queued_at=now(),attempts=0,failure_message='',result='',claim_until=NULL,claim_token=NULL,finished_at=NULL,updated_at=now()
       WHERE id=$1 AND owner_id=$2 AND status IN ('aberta','falhou') RETURNING id`, [taskId, ownerId, agentId]);
    if (!result.rowCount) throw new ConflictException("A tarefa mudou de estado. Atualize a lista e tente de novo.");
    await this.audit.record({ actor: ownerId, action: "task.queued", subject: taskId, details: { taskId, agentId } });
    return { queued: true };
  }

  async cancel(ownerId: string, taskId: string): Promise<unknown> {
    const task = await this.ownedTask(ownerId, taskId);
    if (task.status === "em_andamento") throw new ConflictException("A tarefa já está sendo executada.");
    if (task.status !== "na_fila") throw new ConflictException("Só é possível cancelar uma tarefa que está na fila.");
    const result = await this.database.getPool().query(
      `UPDATE tasks SET status='aberta',agent_id=NULL,claim_until=NULL,claim_token=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 AND status='na_fila' RETURNING agent_id`, [taskId, ownerId]);
    if (!result.rowCount) throw new ConflictException("A tarefa já está sendo executada.");
    await this.audit.record({ actor: ownerId, action: "task.cancelled", subject: taskId, details: { taskId, agentId: task.agentId } });
    return { cancelled: true };
  }

  async retry(ownerId: string, taskId: string): Promise<unknown> {
    const task = await this.ownedTask(ownerId, taskId);
    if (task.status !== "falhou" || !task.agentId) throw new ConflictException("Só é possível tentar de novo uma tarefa que falhou.");
    return this.enqueue(ownerId, taskId, task.agentId);
  }

  async claimDue(now = new Date()): Promise<ClaimedTask[]> {
    const leaseUntil = new Date(now.getTime() + TASK_QUEUE_LEASE_MS);
    const claimed: ClaimedTask[] = [];
    for (let index = 0; index < 5; index += 1) {
      const claimToken = randomUUID();
      const result = await this.database.getPool().query(
        `UPDATE tasks SET status='em_andamento',claim_until=$2,claim_token=$3,attempts=attempts+1,updated_at=$1
         WHERE id = (SELECT id FROM tasks WHERE status='na_fila' AND (claim_until IS NULL OR claim_until <= $1) ORDER BY queued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id,owner_id AS "ownerId",title,description,agent_id AS "agentId",claim_token AS "claimToken",attempts`, [now, leaseUntil, claimToken]);
      if (!result.rowCount) break;
      claimed.push(result.rows[0] as ClaimedTask);
    }
    return claimed;
  }

  async recoverExpired(now = new Date()): Promise<void> {
    await this.database.getPool().query(
      `UPDATE tasks SET status='na_fila',claim_until=NULL,claim_token=NULL,updated_at=now()
       WHERE status='em_andamento' AND claim_until <= $1 AND attempts < 3`, [now]);
    const expired = await this.database.getPool().query(
      `UPDATE tasks SET status='falhou',failure_message=$2,finished_at=now(),claim_until=NULL,claim_token=NULL,updated_at=now()
       WHERE status='em_andamento' AND claim_until <= $1 AND attempts >= 3
       RETURNING id,owner_id AS "ownerId"`, [now, FAILURE]);
    for (const task of expired.rows as Array<{ id: string; ownerId: string }>) {
      await this.notifications.create({ owner: task.ownerId, kind: "task.failed", title: "Tarefa não concluída", body: FAILURE, details: { taskId: task.id } });
    }
  }

  async runOnce(now = new Date()): Promise<number> {
    if (this.running || !this.database.isReady()) return 0;
    this.running = true;
    try {
      await this.recoverExpired(now);
      const claimed = await this.claimDue(now);
      for (const task of claimed) await this.runClaimed(task);
      return claimed.length;
    } finally { this.running = false; }
  }

  async runClaimed(task: ClaimedTask): Promise<void> {
    try {
      const agent = await this.workerAgent(task.agentId);
      const response = await replyAsAgent({ agent, providers: this.providers, conversationId: task.id,
        messages: [{ role: "system", content: agent.instructions || `Você é ${agent.name}. Conclua a tarefa da pessoa.` }, { role: "user", content: `${task.title}\n\n${task.description}` }] });
      const secrets = await this.secretsForMasking();
      const safe = maskSecrets(response, secrets).slice(0, 20_000);
      const updated = await this.database.getPool().query(
        `UPDATE tasks SET result=$3,status='concluida',finished_at=now(),failure_message='',claim_until=NULL,claim_token=NULL,updated_at=now() WHERE id=$1 AND claim_token=$2 RETURNING id`, [task.id, task.claimToken, safe]);
      if (updated.rowCount) await this.notifications.create({ owner: task.ownerId, kind: "task.completed", title: "Tarefa concluída", body: "O bot concluiu sua tarefa.", details: { taskId: task.id } });
    } catch {
      if (task.attempts < 3) {
        await this.database.getPool().query(`UPDATE tasks SET status='na_fila',claim_until=NULL,claim_token=NULL,updated_at=now() WHERE id=$1 AND claim_token=$2`, [task.id, task.claimToken]);
      } else {
        const updated = await this.database.getPool().query(`UPDATE tasks SET status='falhou',failure_message=$3,finished_at=now(),claim_until=NULL,claim_token=NULL,updated_at=now() WHERE id=$1 AND claim_token=$2 RETURNING id`, [task.id, task.claimToken, FAILURE]);
        if (updated.rowCount) await this.notifications.create({ owner: task.ownerId, kind: "task.failed", title: "Tarefa não concluída", body: FAILURE, details: { taskId: task.id } });
      }
    }
  }

  private async ownedTask(ownerId: string, taskId: string): Promise<{ status: string; agentId: string | null; title: string; description: string }> {
    const result = await this.database.getPool().query(`SELECT status,agent_id AS "agentId",title,description FROM tasks WHERE id=$1 AND owner_id=$2`, [taskId, ownerId]);
    if (!result.rowCount) throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." });
    return result.rows[0] as { status: string; agentId: string | null; title: string; description: string };
  }
  private async principal(ownerId: string): Promise<Principal> {
    const result = await this.database.getPool().query(`SELECT id,name,role FROM users WHERE id=$1`, [ownerId]);
    if (!result.rowCount) throw new ForbiddenException("Pessoa não autorizada.");
    return result.rows[0] as Principal;
  }
  private async workerAgent(agentId: string): Promise<AgentRecord> {
    const result = await this.database.getPool().query(`SELECT id,name,description,instructions,model,enabled,avatar,role,department,specialties,provider,generation_config AS "generationConfig",tools_allowed AS "toolsAllowed",owner_id AS "ownerId",provider_kind AS "providerKind",endpoint_url AS "endpointUrl",endpoint_protocol AS "endpointProtocol",endpoint_token_secret AS "endpointTokenSecret",(endpoint_token_secret IS NOT NULL) AS "hasEndpointToken" FROM agents WHERE id=$1 AND enabled=true`, [agentId]);
    if (!result.rowCount) throw new Error("agent unavailable");
    return result.rows[0] as AgentRecord;
  }
  private async secretsForMasking(): Promise<string[]> { return this.tools.secretsForMasking(); }
}
