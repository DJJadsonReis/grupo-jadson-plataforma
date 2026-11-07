import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ApiTokenGuard } from "./api-token.guard";

@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiTokenGuard }],
})
export class AuthModule {}
