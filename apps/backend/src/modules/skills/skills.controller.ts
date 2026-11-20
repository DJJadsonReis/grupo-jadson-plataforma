import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { SkillInput, SkillsService } from "./skills.service";

interface PrincipalRequest { principal: Principal }

@Controller("skills")
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@Req() request: PrincipalRequest) {
    return this.skills.list(request.principal);
  }

  @Post()
  create(@Body() body: SkillInput, @Req() request: PrincipalRequest) {
    return this.skills.create(request.principal, body);
  }

  @Delete(":slug")
  async remove(@Param("slug") slug: string, @Req() request: PrincipalRequest) {
    await this.skills.remove(request.principal, slug);
    return { deleted: true };
  }
}
