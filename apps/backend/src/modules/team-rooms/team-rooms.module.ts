import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AgentsModule } from "../agents/agents.module";
import { ProvidersModule } from "../providers/providers.module";
import { TeamRoomsController } from "./team-rooms.controller";
import { TeamRoomsService } from "./team-rooms.service";
import { PersonalEditionGuard } from "../../common/personal-edition.guard";
import { AuditModule } from "../audit/audit.module";

@Module({ imports: [DatabaseModule, AgentsModule, ProvidersModule, AuditModule], controllers: [TeamRoomsController], providers: [TeamRoomsService, PersonalEditionGuard] })
export class TeamRoomsModule {}
