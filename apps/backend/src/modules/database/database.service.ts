import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { MaskedLogger } from "../../common/masked-logger";
import { maskSecrets } from "../../common/secret-masking";
import { Pool } from "pg";
import { migrationId, up } from "./migrations/001-initial-schema";
import { migrationId as agentLinkMigrationId, up as addConversationAgentLink } from "./migrations/002-conversation-agent-link";
import { migrationId as multiAgentMigrationId, up as addMultiAgentSchema } from "./migrations/003-multiagent-controller";
import { migrationId as usageMigrationId, up as addUsageMetering } from "./migrations/004-usage-metering";
import { migrationId as auditMigrationId, up as addAuditAndApprovals } from "./migrations/005-audit-and-approvals";
import { migrationId as memoryMigrationId, up as addMemory } from "./migrations/006-memory";
import { migrationId as handoffsMigrationId, up as addHandoffs } from "./migrations/007-handoffs";
import { migrationId as usersMigrationId, up as addUsers } from "./migrations/008-users";
import { migrationId as toolRunsMigrationId, up as addToolRuns } from "./migrations/009-tool-runs";
import { migrationId as routinesMigrationId, up as addRoutines } from "./migrations/010-routines";
import { migrationId as routineLimitsMigrationId, up as addRoutineLimits } from "./migrations/012-routine-limits";
import { migrationId as agentPoliciesMigrationId, up as addAgentPolicies } from "./migrations/013-agent-policies";
import { migrationId as signInMigrationId, up as addSignIn } from "./migrations/014-sign-in";
import { migrationId as loopbackReturnMigrationId, up as addLoopbackReturn } from "./migrations/015-loopback-return";
import { migrationId as integrationsMigrationId, up as addIntegrations } from "./migrations/011-integrations";
import { migrationId as googleMigrationId, up as addGoogleConnections } from "./migrations/016-google-connections";
import { migrationId as userPreferencesMigrationId, up as addUserPreferences } from "./migrations/017-user-preferences";
import { migrationId as routineClaimsMigrationId, up as addRoutineClaims } from "./migrations/018-routine-claims";
import { migrationId as routineOwnerMigrationId, up as addRoutineOwner } from "./migrations/020-routine-owner";
import { migrationId as notificationsMigrationId, up as addNotifications } from "./migrations/019-notifications";
import { migrationId as botSharingMigrationId, up as addBotSharing } from "./migrations/021-bot-sharing";
import { migrationId as conversationOwnerMigrationId, up as addConversationOwner } from "./migrations/022-conversation-owner";
import { migrationId as skillsMigrationId, up as addSkills } from "./migrations/023-skills";
import { migrationId as agentSkillsMigrationId, up as addAgentSkills } from "./migrations/024-agent-skills";
import { migrationId as tasksMigrationId, up as addTasks } from "./migrations/025-tasks";
import { migrationId as globalSkillsMigrationId, up as addGlobalSkills } from "./migrations/026-skills-globais";
import { migrationId as skillToolsMigrationId, up as addSkillTools } from "./migrations/027-skills-ferramentas";
import { migrationId as responsibilitiesMigrationId, up as addResponsibilities } from "./migrations/028-responsibilities";
import { migrationId as agentEndpointsMigrationId, up as addAgentEndpoints } from "./migrations/029-agent-endpoints";
import { migrationId as mcpServersMigrationId, up as addMcpServers } from "./migrations/030-mcp-servers";
import { migrationId as routineScheduleMigrationId, up as addRoutineSchedule } from "./migrations/031-routine-schedule";
import { migrationId as teamRoomsMigrationId, up as addTeamRooms } from "./migrations/032-team-rooms";
import { migrationId as connectionSharesMigrationId, up as addConnectionShares } from "./migrations/033-connection-shares";
import { migrationId as usageOwnerMigrationId, up as addUsageOwner } from "./migrations/034-usage-owner";
import { migrationId as notificationKindsMigrationId, up as addNotificationKinds } from "./migrations/035-notifications-kinds";
import { migrationId as modelProvidersMigrationId, up as addModelProviders } from "./migrations/036-model-providers";
import { migrationId as agentModelRoutingMigrationId, up as addAgentModelRouting } from "./migrations/037-agent-model-routing";
import { migrationId as providerModelsMigrationId, up as addProviderModels } from "./migrations/038-provider-discovered-models";
import { migrationId as mcpHttpMigrationId, up as addMcpHttp } from "./migrations/039-mcp-http";
import { migrationId as modelAvailabilityMigrationId, up as addModelAvailability } from "./migrations/040-model-availability";
import { migrationId as humanSupportMigrationId, up as addHumanSupport } from "./migrations/041-human-support";
import { migrationId as operationModesMigrationId, up as addOperationModes } from "./migrations/042-operation-modes";
import { migrationId as modelPricesMigrationId, up as addModelPrices } from "./migrations/043-model-prices";
import { migrationId as conversationEffortMigrationId, up as addConversationEffort } from "./migrations/044-conversation-effort";
import { migrationId as conversationModelMigrationId, up as addConversationModel } from "./migrations/045-conversation-model";
import { migrationId as providerTestStatusMigrationId, up as addProviderTestStatus } from "./migrations/046-provider-test-status";
import { migrationId as mcpServerTokensMigrationId, up as addMcpServerTokens } from "./migrations/047-mcp-server-tokens";
import { migrationId as auditRetentionMigrationId, up as addAuditRetentionSetting } from "./migrations/048-audit-retention-setting";
import { migrationId as handoffContextMigrationId, up as addHandoffContext } from "./migrations/049-handoff-context";
import { migrationId as agentEndpointProtocolMigrationId, up as addAgentEndpointProtocol } from "./migrations/050-agent-endpoint-protocol";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new MaskedLogger(DatabaseService.name);
  private readonly pool: Pool | null;
  private ready = false;
  private vectorReady = false;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();
    this.pool = connectionString ? new Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000 }) : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn("DATABASE_URL ausente; persistência PostgreSQL indisponível.");
      return;
    }
    try {
      await this.pool.query("SELECT 1");
      await this.pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const migrations = [
        { id: migrationId, apply: async () => { this.vectorReady = await up(this.pool!); } },
        { id: agentLinkMigrationId, apply: async () => addConversationAgentLink(this.pool!) },
        { id: multiAgentMigrationId, apply: async () => addMultiAgentSchema(this.pool!) },
        { id: usageMigrationId, apply: async () => addUsageMetering(this.pool!) },
        { id: auditMigrationId, apply: async () => addAuditAndApprovals(this.pool!) },
        { id: memoryMigrationId, apply: async () => addMemory(this.pool!) },
        { id: handoffsMigrationId, apply: async () => addHandoffs(this.pool!) },
        { id: usersMigrationId, apply: async () => addUsers(this.pool!) },
        { id: toolRunsMigrationId, apply: async () => addToolRuns(this.pool!) },
        { id: routinesMigrationId, apply: async () => addRoutines(this.pool!) },
        { id: routineLimitsMigrationId, apply: async () => addRoutineLimits(this.pool!) },
        { id: agentPoliciesMigrationId, apply: async () => addAgentPolicies(this.pool!) },
        { id: signInMigrationId, apply: async () => addSignIn(this.pool!) },
        { id: loopbackReturnMigrationId, apply: async () => addLoopbackReturn(this.pool!) },
        { id: integrationsMigrationId, apply: async () => addIntegrations(this.pool!) },
        { id: googleMigrationId, apply: async () => addGoogleConnections(this.pool!) },
        { id: userPreferencesMigrationId, apply: async () => addUserPreferences(this.pool!) },
        { id: routineClaimsMigrationId, apply: async () => addRoutineClaims(this.pool!) },
        { id: routineOwnerMigrationId, apply: async () => addRoutineOwner(this.pool!) },
        { id: notificationsMigrationId, apply: async () => addNotifications(this.pool!) },
        { id: botSharingMigrationId, apply: async () => addBotSharing(this.pool!) },
        { id: conversationOwnerMigrationId, apply: async () => addConversationOwner(this.pool!) },
        { id: skillsMigrationId, apply: async () => addSkills(this.pool!) },
        { id: agentSkillsMigrationId, apply: async () => addAgentSkills(this.pool!) },
        { id: tasksMigrationId, apply: async () => addTasks(this.pool!) },
        { id: globalSkillsMigrationId, apply: async () => addGlobalSkills(this.pool!) },
        { id: skillToolsMigrationId, apply: async () => addSkillTools(this.pool!) },
        { id: responsibilitiesMigrationId, apply: async () => addResponsibilities(this.pool!) },
        { id: agentEndpointsMigrationId, apply: async () => addAgentEndpoints(this.pool!) },
        { id: mcpServersMigrationId, apply: async () => addMcpServers(this.pool!) },
        { id: routineScheduleMigrationId, apply: async () => addRoutineSchedule(this.pool!) },
        { id: teamRoomsMigrationId, apply: async () => addTeamRooms(this.pool!) },
        { id: connectionSharesMigrationId, apply: async () => addConnectionShares(this.pool!) },
        { id: usageOwnerMigrationId, apply: async () => addUsageOwner(this.pool!) },
        { id: notificationKindsMigrationId, apply: async () => addNotificationKinds(this.pool!) },
        { id: modelProvidersMigrationId, apply: async () => addModelProviders(this.pool!) },
        { id: agentModelRoutingMigrationId, apply: async () => addAgentModelRouting(this.pool!) },
        { id: providerModelsMigrationId, apply: async () => addProviderModels(this.pool!) },
        { id: mcpHttpMigrationId, apply: async () => addMcpHttp(this.pool!) },
        { id: modelAvailabilityMigrationId, apply: async () => addModelAvailability(this.pool!) },
        { id: humanSupportMigrationId, apply: async () => addHumanSupport(this.pool!) },
        { id: operationModesMigrationId, apply: async () => addOperationModes(this.pool!) },
        { id: modelPricesMigrationId, apply: async () => addModelPrices(this.pool!) },
        { id: conversationEffortMigrationId, apply: async () => addConversationEffort(this.pool!) },
        { id: conversationModelMigrationId, apply: async () => addConversationModel(this.pool!) },
        { id: providerTestStatusMigrationId, apply: async () => addProviderTestStatus(this.pool!) },
        { id: mcpServerTokensMigrationId, apply: async () => addMcpServerTokens(this.pool!) },
        { id: auditRetentionMigrationId, apply: async () => addAuditRetentionSetting(this.pool!) },
        { id: handoffContextMigrationId, apply: async () => addHandoffContext(this.pool!) },
        { id: agentEndpointProtocolMigrationId, apply: async () => addAgentEndpointProtocol(this.pool!) },
      ];
      for (const migration of migrations) {
        const result = await this.pool.query("SELECT id FROM schema_migrations WHERE id = $1", [migration.id]);
        if (result.rowCount === 0) {
          await migration.apply();
          await this.pool.query("INSERT INTO schema_migrations(id) VALUES ($1)", [migration.id]);
        }
      }
      try { await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector"); }
      catch { this.vectorReady = false; }
      const extension = await this.pool.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS installed");
      this.vectorReady = Boolean(extension.rows[0]?.installed);
      this.ready = true;
      this.logger.log("PostgreSQL conectado e migrações aplicadas.");
      if (!this.vectorReady) this.logger.warn("pgvector não está disponível; recursos vetoriais permanecem desativados.");
    } catch (error) {
      this.ready = false;
      this.logger.error(`PostgreSQL indisponível: ${maskSecrets(error instanceof Error ? error.message : "erro desconhecido")}`);
    }
  }

  async onModuleDestroy(): Promise<void> { await this.pool?.end(); }
  isReady(): boolean { return this.ready; }
  isVectorReady(): boolean { return this.vectorReady; }

  async checkConnection(): Promise<boolean> {
    if (!this.pool) return false;
    if (!this.ready) {
      await this.onModuleInit();
      return this.ready;
    }
    try { await this.pool.query("SELECT 1"); return true; }
    catch { this.ready = false; return false; }
  }

  getPool(): Pool {
    if (!this.pool || !this.ready) throw new ServiceUnavailableException({ code: "DATABASE_NOT_READY", message: "Persistência indisponível. Verifique DATABASE_URL e PostgreSQL." });
    return this.pool;
  }
}
