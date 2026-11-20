import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { GoogleModule } from "../google/google.module";
import { ConnectionSharesController } from "./connection-shares.controller";
import { ConnectionSharesService } from "./connection-shares.service";
@Module({ imports: [DatabaseModule, GoogleModule, AuditModule], controllers: [ConnectionSharesController], providers: [ConnectionSharesService], exports: [ConnectionSharesService] })
export class ConnectionSharesModule {}
