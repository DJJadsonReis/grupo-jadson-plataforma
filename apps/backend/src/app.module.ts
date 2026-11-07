import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { ChatModule } from "./modules/chat/chat.module";
import { AgentsModule } from "./modules/agents/agents.module";
import { QueueModule } from "./modules/queue/queue.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({ imports: [AuthModule, HealthModule, ChatModule, AgentsModule, QueueModule] })
export class AppModule {}
