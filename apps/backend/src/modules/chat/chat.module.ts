import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { DatabaseModule } from "../database/database.module";
import { ChatController } from "./chat.controller";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

@Module({ imports: [ProvidersModule, DatabaseModule], controllers: [ChatController, ConversationsController], providers: [ConversationsService] })
export class ChatModule {}
