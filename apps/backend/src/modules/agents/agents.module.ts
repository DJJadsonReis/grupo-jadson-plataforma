import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { AgentPermissionsService } from "./agent-permissions.service";
import { TeamsController } from "./teams.controller";
import { PersonalEditionGuard } from "../../common/personal-edition.guard";
import { ProvidersModule } from "../providers/providers.module";

@Module({ imports: [DatabaseModule, ProvidersModule], controllers: [AgentsController, GroupsController, TeamsController], providers: [AgentsService, GroupsService, AgentPermissionsService, PersonalEditionGuard], exports: [AgentsService, GroupsService, AgentPermissionsService] })
export class AgentsModule {}
