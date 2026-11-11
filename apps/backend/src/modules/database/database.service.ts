import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
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
import { migrationId as integrationsMigrationId, up as addIntegrations } from "./migrations/011-integrations";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
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
        { id: integrationsMigrationId, apply: async () => addIntegrations(this.pool!) },
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
      this.logger.error(`PostgreSQL indisponível: ${error instanceof Error ? error.message : "erro desconhecido"}`);
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
