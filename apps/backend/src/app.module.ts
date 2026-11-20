import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { ChatModule } from "./modules/chat/chat.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { QueueModule } from "./modules/queue/queue.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { MemoryModule } from "./modules/memory/memory.module";
import { HandoffsModule } from "./modules/handoffs/handoffs.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { ToolsModule } from "./modules/tools/tools.module";
import { RoutinesModule } from "./modules/routines/routines.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { GoogleModule } from "./modules/google/google.module";
import { SkillsModule } from "./modules/skills/skills.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { ResponsibilitiesModule } from "./modules/responsibilities/responsibilities.module";
import { EditionModule } from "./modules/edition/edition.module";
import { TeamRoomsModule } from "./modules/team-rooms/team-rooms.module";
import { ConnectionSharesModule } from "./modules/connection-shares/connection-shares.module";
import { DictationModule } from "./modules/dictation/dictation.module";
import { HumanSupportModule } from "./modules/human-support/human-support.module";

@Module({ imports: [AuthModule, HealthModule, ChatModule, AgentsModule, QueueModule, AuditModule, MemoryModule, HandoffsModule, DocumentsModule, ToolsModule, RoutinesModule, IntegrationsModule, GoogleModule, SkillsModule, TasksModule, ResponsibilitiesModule, EditionModule, TeamRoomsModule, ConnectionSharesModule, DictationModule, HumanSupportModule] })
export class AppModule {}
