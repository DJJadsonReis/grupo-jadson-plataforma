import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";
import { AdminOnly } from "../auth/roles";
import { Principal } from "../auth/users.service";
import { ConnectionSharesService } from "./connection-shares.service";

type Request = { principal?: Principal };
@Controller("connection-shares")
@TeamOnly()
@UseGuards(PersonalEditionGuard)
export class ConnectionSharesController {
  constructor(private readonly shares: ConnectionSharesService) {}
  @Get() list(@Req() req: Request) { return this.shares.list(req.principal!); }
  @Post() request(@Body() body: { granteeId?: unknown }, @Req() req: Request) { return this.shares.request(body?.granteeId, req.principal!); }
  @Delete(":granteeId") revoke(@Param("granteeId") id: string, @Query("ownerId") ownerId: string | undefined, @Req() req: Request) { return this.shares.revoke(id, req.principal!, ownerId); }
  @Get("pending") @AdminOnly() pending() { return this.shares.pending(); }
  @Post(":ownerId/:granteeId/approve") @AdminOnly() approve(@Param("ownerId") owner: string, @Param("granteeId") grantee: string, @Req() req: Request) { return this.shares.approve(owner, grantee, req.principal!); }
}
