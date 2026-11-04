import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({ imports: [DatabaseModule], controllers: [AgentsController, GroupsController], providers: [AgentsService, GroupsService], exports: [AgentsService, GroupsService] })
export class AgentsModule {}
