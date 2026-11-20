import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { ApiTokenGuard } from "./api-token.guard";
import { AuthController } from "./auth.controller";
import { OidcService } from "./oidc.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PersonalEditionGuard } from "../../common/personal-edition.guard";
import { IdentityProvidersController } from "./identity-providers.controller";
import { HumanSupportModule } from "../human-support/human-support.module";

@Module({
  imports: [DatabaseModule, HumanSupportModule],
  controllers: [UsersController, AuthController, IdentityProvidersController],
  providers: [{ provide: APP_GUARD, useClass: ApiTokenGuard }, PersonalEditionGuard, UsersService, OidcService],
  exports: [UsersService],
})
export class AuthModule {}
