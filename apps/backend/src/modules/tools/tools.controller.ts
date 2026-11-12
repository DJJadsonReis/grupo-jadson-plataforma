import { BadRequestException, Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ToolsService } from "./tools.service";

@Controller("tools")
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  /** Ferramentas disponíveis e o risco de cada uma. */
  @Get()
  catalog() {
    return this.tools.catalog();
  }

  /** Execuções recentes, com o estado de cada aprovação. */
  @Get("runs")
  runs() {
    return this.tools.list();
  }

  @Post(":name/invoke")
  invoke(@Param("name") name: string, @Body() body: { input?: unknown; agentId?: unknown }, @Req() request: { principal?: { id: string; name: string } }) {
    const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input) ? (body.input as Record<string, unknown>) : {};
    if (typeof name !== "string" || !name) throw new BadRequestException({ code: "INVALID_TOOL", message: "Informe a ferramenta." });
    const agentId = typeof body?.agentId === "string" && body.agentId ? body.agentId : undefined;
    return this.tools.invoke(name, input, request.principal?.name ?? "sistema", agentId, request.principal?.id);
  }

  /** Executa uma ação sensível depois que a aprovação foi concedida. */
  @Post("runs/:id/execute")
  execute(@Param("id") id: string, @Req() request: { principal?: { name: string } }) {
    return this.tools.executeApproved(id, request.principal?.name ?? "sistema");
  }
}
