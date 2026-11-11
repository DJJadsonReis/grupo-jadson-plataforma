import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { ApiTokenGuard } from "./api-token.guard";
import { AuthController } from "./auth.controller";
import { OidcService } from "./oidc.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController, AuthController],
  providers: [{ provide: APP_GUARD, useClass: ApiTokenGuard }, UsersService, OidcService],
  exports: [UsersService],
})
export class AuthModule {}
