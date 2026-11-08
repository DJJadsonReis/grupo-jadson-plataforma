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

@Module({ imports: [AuthModule, HealthModule, ChatModule, AgentsModule, QueueModule, AuditModule, MemoryModule, HandoffsModule, DocumentsModule, ToolsModule, RoutinesModule] })
export class AppModule {}
