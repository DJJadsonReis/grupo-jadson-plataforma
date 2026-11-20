import { Injectable } from "@nestjs/common";
import { AgentsService } from "../agents/agents.service";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { Principal } from "../auth/users.service";
import { MemoryService } from "../memory/memory.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RoutinesService } from "../routines/routines.service";
import { TasksService } from "../tasks/tasks.service";
import { DatabaseService } from "../database/database.service";
import { RedisService } from "../redis/redis.service";
import { QueueService } from "../queue/queue.service";

export const MCP_TOOL_DEFINITIONS = [
  { name: "plataforma_status", description: "Consulta a versão e a situação dos serviços da plataforma.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "tarefas_listar", description: "Lista suas tarefas abertas e concluídas.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "tarefas_criar", description: "Cria uma tarefa para você.", inputSchema: { type: "object", properties: { title: { type: "string", minLength: 1, maxLength: 120 }, description: { type: "string", maxLength: 2000 } }, required: ["title"], additionalProperties: false } },
  { name: "memoria_listar", description: "Lista suas memórias salvas, se a memória estiver ligada.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "memoria_lembrar", description: "Salva uma informação na sua memória, se estiver ligada.", inputSchema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 500 } }, required: ["content"], additionalProperties: false } },
  { name: "agentes_listar", description: "Lista os agentes que você tem permissão para usar.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "rotinas_listar", description: "Lista suas rotinas agendadas.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "notificacoes_listar", description: "Lista suas notificações não lidas.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
] as const;

@Injectable()
export class McpServerTools {
  constructor(
    private readonly tasks: TasksService, private readonly memory: MemoryService,
    private readonly agents: AgentsService, private readonly permissions: AgentPermissionsService,
    private readonly routines: RoutinesService, private readonly notifications: NotificationsService,
    private readonly database: DatabaseService, private readonly redis: RedisService, private readonly queue: QueueService,
  ) {}

  definitions() { return MCP_TOOL_DEFINITIONS; }

  async resources(principal: Principal): Promise<Array<{ uri: string; name: string; description: string; mimeType: string }>> {
    const ownerId = principal.id;
    const accessible = await this.permissions.listAccessible(principal);
    const records = await Promise.all(accessible.map(async ({ id }) => this.agents.get(id)));
    return records.filter((agent): agent is NonNullable<typeof agent> => Boolean(agent)).map((agent) => ({
      uri: `agente://${agent.id}`, name: agent.name, description: agent.description, mimeType: "application/json",
    }));
  }

  async call(name: string, args: Record<string, unknown>, principal: Principal): Promise<unknown> {
    const ownerId = principal.id;
    switch (name) {
      case "plataforma_status": {
        const [postgres, redis] = await Promise.all([this.database.checkConnection(), this.redis.checkConnection()]);
        return { version: "0.1.0", services: { postgres: postgres ? "connected" : "unavailable", pgvector: this.database.isVectorReady() ? "connected" : "unavailable", redis: redis ? "connected" : "unavailable", queue: this.queue.getDriver() } };
      }
      case "tarefas_listar": return this.tasks.list(ownerId);
      case "tarefas_criar": return this.tasks.create(ownerId, args as { title: string; description?: string });
      case "memoria_listar": return (await this.memory.isEnabled(ownerId)) ? this.memory.list(ownerId) : [];
      case "memoria_lembrar": return this.memory.remember(String(args.content ?? ""), ownerId);
      case "agentes_listar": {
        const ownerId = principal.id;
        const allowed = new Set((await this.permissions.listAccessible(principal)).map((item) => item.id));
        return (await this.agents.list()).filter((agent) => allowed.has(agent.id)).map(({ instructions: _instructions, toolsAllowed: _tools, endpointUrl: _url, ...agent }) => agent);
      }
      case "rotinas_listar": return this.routines.list(ownerId);
      case "notificacoes_listar": return this.notifications.listUnread(ownerId);
      default: throw Object.assign(new Error("Ferramenta não encontrada."), { code: -32602 });
    }
  }

  async readAgentResource(uri: string, principal: Principal): Promise<unknown | null> {
    if (!uri.startsWith("agente://")) return null;
    const id = uri.slice("agente://".length);
    const ownerId = principal.id;
    if ((await this.permissions.access(id, principal)) === "none") return null;
    const agent = await this.agents.get(id);
    if (!agent) return null;
    const { instructions: _instructions, toolsAllowed: _tools, endpointUrl: _url, endpointTokenSecret: _secret, ...metadata } = agent;
    return metadata;
  }
}
