import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ToolsModule } from "../tools/tools.module";
import { RoutinesController } from "./routines.controller";
import { RoutinesService } from "./routines.service";

@Module({
  imports: [DatabaseModule, ToolsModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
})
export class RoutinesModule {}
