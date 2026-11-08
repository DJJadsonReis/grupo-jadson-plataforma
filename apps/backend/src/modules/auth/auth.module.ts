import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { ApiTokenGuard } from "./api-token.guard";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [{ provide: APP_GUARD, useClass: ApiTokenGuard }, UsersService],
  exports: [UsersService],
})
export class AuthModule {}
