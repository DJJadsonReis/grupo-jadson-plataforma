import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";
import { AgentSkillsController } from "./agent-skills.controller";
import { AgentSkillsService } from "./agent-skills.service";

@Module({ imports: [DatabaseModule], controllers: [SkillsController, AgentSkillsController], providers: [SkillsService, AgentSkillsService], exports: [SkillsService] })
export class SkillsModule {}
