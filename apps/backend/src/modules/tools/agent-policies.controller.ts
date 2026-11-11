import { BadRequestException, Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { AdminOnly } from "../auth/roles";
import { AgentPolicyService } from "./agent-policy.service";
import { ToolsService } from "./tools.service";

/** Regras de cada agente. Ler é liberado a qualquer papel; alterar exige administrador. */
@Controller("agents/:agentId/policies")
export class AgentPoliciesController {
  constructor(private readonly policies: AgentPolicyService, private readonly tools: ToolsService) {}

  @Get()
  list(@Param("agentId") agentId: string) {
    return this.policies.list(agentId);
  }

  @AdminOnly()
  @Put(":tool")
  set(@Param("agentId") agentId: string, @Param("tool") tool: string, @Body() body: { decision?: unknown }) {
    if (!this.tools.catalog().some((item) => item.name === tool)) {
      throw new BadRequestException({ code: "INVALID_POLICY", message: "Ferramenta desconhecida." });
    }
    return this.policies.set(agentId, tool, typeof body?.decision === "string" ? body.decision : "");
  }

  @AdminOnly()
  @Delete(":tool")
  async remove(@Param("agentId") agentId: string, @Param("tool") tool: string) {
    await this.policies.remove(agentId, tool);
    return { ok: true };
  }
}
