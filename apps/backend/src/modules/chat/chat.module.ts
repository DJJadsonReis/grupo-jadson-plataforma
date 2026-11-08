import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { DatabaseModule } from "../database/database.module";
import { ChatController } from "./chat.controller";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { AgentsModule } from "../agents/agents.module";
import { UsageService } from "./usage.service";
import { UsageController } from "./usage.controller";
import { AuditModule } from "../audit/audit.module";
import { MemoryModule } from "../memory/memory.module";

@Module({ imports: [ProvidersModule, DatabaseModule, AgentsModule, AuditModule, MemoryModule],controllers: [ChatController, ConversationsController, UsageController],providers: [ConversationsService, UsageService] })
export class ChatModule {}
