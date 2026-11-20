import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { AgentSkillsService } from "./agent-skills.service";

interface PrincipalRequest { principal: Principal }

@Controller("agents/:agentId/skills")
export class AgentSkillsController {
  constructor(private readonly skills: AgentSkillsService) {}

  @Get()
  list(@Param("agentId") agentId: string, @Req() request: PrincipalRequest) {
    return this.skills.listForAgent(request.principal.id, agentId);
  }

  @Post()
  @HttpCode(200)
  attach(@Param("agentId") agentId: string, @Body() body: { slug?: unknown }, @Req() request: PrincipalRequest) {
    if (!body || typeof body.slug !== "string" || !body.slug) {
      throw new BadRequestException({ code: "INVALID_SKILL", message: "Informe o slug da habilidade." });
    }
    return this.skills.attach(request.principal.id, agentId, body.slug);
  }

  @Delete(":slug")
  async detach(@Param("agentId") agentId: string, @Param("slug") slug: string, @Req() request: PrincipalRequest) {
    await this.skills.detach(request.principal.id, agentId, slug);
    return { deleted: true };
  }
}
