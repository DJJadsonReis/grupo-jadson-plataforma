import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { AgentPermissionsService } from "./agent-permissions.service";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";

interface PrincipalRequest { principal?: Principal }

@Controller("teams")
@UseGuards(PersonalEditionGuard)
@TeamOnly()
export class TeamsController {
  constructor(private readonly permissions: AgentPermissionsService) {}

  @Get()
  list() { return this.permissions.listTeams(); }

  @Get("directory/people")
  listPeople() { return this.permissions.listPeople(); }

  @Post()
  create(@Body() body: unknown, @Req() request: PrincipalRequest) {
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).name !== "string") {
      throw new BadRequestException("Nome do time inválido.");
    }
    const name = ((body as { name: string }).name).trim();
    if (!name || name.length > 80) throw new BadRequestException("Nome do time deve ter de 1 a 80 caracteres.");
    return this.permissions.createTeam(name, this.principal(request));
  }

  @Get(":id/members")
  listMembers(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertUuid(id);
    return this.permissions.listTeamMembers(id, this.principal(request));
  }

  @Put(":id/members/:userId")
  async addMember(@Param("id") id: string, @Param("userId") userId: string, @Req() request: PrincipalRequest) {
    this.assertUuid(id); this.assertUuid(userId);
    await this.permissions.addTeamMember(id, userId, this.principal(request));
    return { added: true };
  }

  @Delete(":id/members/:userId")
  async removeMember(@Param("id") id: string, @Param("userId") userId: string, @Req() request: PrincipalRequest) {
    this.assertUuid(id); this.assertUuid(userId);
    await this.permissions.removeTeamMember(id, userId, this.principal(request));
    return { removed: true };
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() request: PrincipalRequest) {
    this.assertUuid(id);
    await this.permissions.deleteTeam(id, this.principal(request));
    return { deleted: true };
  }

  private principal(request: PrincipalRequest): Principal {
    return request.principal ?? { id: "sistema", name: "Administrador", role: "admin" };
  }

  private assertUuid(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException("Identificador inválido.");
    }
  }
}
