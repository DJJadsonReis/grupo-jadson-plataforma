import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";
import { Principal } from "../auth/users.service";
import { TeamRoomsService } from "./team-rooms.service";

type Request = { principal?: Principal };

@Controller("team-rooms")
@TeamOnly()
@UseGuards(PersonalEditionGuard)
export class TeamRoomsController {
  constructor(private readonly rooms: TeamRoomsService) {}
  @Get() list(@Req() request: Request) { return this.rooms.list(request.principal!); }
  @Get("me") me(@Req() request: Request) { return { id: request.principal!.id, name: request.principal!.name }; }
  @Post() create(@Body() body: { name?: unknown }, @Req() request: Request) { return this.rooms.create(body?.name, request.principal!); }
  @Get("people") people() { return this.rooms.people(); }
  @Get(":id") get(@Param("id") id: string, @Req() request: Request) { return this.rooms.get(id, request.principal!); }
  @Post(":id/members") addMember(@Param("id") id: string, @Body() body: { personId?: unknown }, @Req() request: Request) { return this.rooms.addMember(id, body?.personId, request.principal!); }
  @Delete(":id/members/:personId") removeMember(@Param("id") id: string, @Param("personId") personId: string, @Req() request: Request) { return this.rooms.removeMember(id, personId, request.principal!); }
  @Get(":id/messages") messages(@Param("id") id: string, @Req() request: Request) { return this.rooms.messages(id, request.principal!); }
  @Post(":id/messages") send(@Param("id") id: string, @Body() body: { content?: unknown }, @Req() request: Request) { return this.rooms.send(id, body?.content, request.principal!); }
}
