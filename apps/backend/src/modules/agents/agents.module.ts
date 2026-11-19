import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { AgentPermissionsService } from "./agent-permissions.service";
import { TeamsController } from "./teams.controller";

@Module({ imports: [DatabaseModule], controllers: [AgentsController, GroupsController, TeamsController], providers: [AgentsService, GroupsService, AgentPermissionsService], exports: [AgentsService, GroupsService, AgentPermissionsService] })
export class AgentsModule {}
