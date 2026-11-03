import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";

@Module({ imports: [DatabaseModule], controllers: [AgentsController], providers: [AgentsService] })
export class AgentsModule {}
