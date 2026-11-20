import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, BadRequestException, Req } from "@nestjs/common";
import { AdminOnly } from "../auth/roles";
import { ManagedInput, McpService } from "./mcp.service";

@Controller("mcp/servers")
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Get()
  async list() {
    return this.mcp.listManaged();
  }

  @Get("capabilities")
  capabilities(@Req() request: { principal?: { role: string } }) { return { canManage: request.principal?.role === "admin" }; }

  @Post()
  @AdminOnly()
  @HttpCode(200)
  create(@Body() body: unknown) { return this.save(null, body); }

  @Patch(":id")
  @AdminOnly()
  update(@Param("id") id: string, @Body() body: unknown) { return this.save(id, body); }

  private async save(id: string | null, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "Informe os dados do servidor MCP." });
    const input = body as Partial<ManagedInput>;
    if (!id && (!input.name || typeof input.enabled !== "boolean" || ((input.transport ?? "stdio") === "stdio" && (!input.command || !Array.isArray(input.args))))) throw new BadRequestException({ code: "MCP_SERVER_INVALID", message: "Nome, dados do transporte e estado ligado são obrigatórios." });
    const result = await this.mcp.saveManaged(id, input as ManagedInput);
    return result;
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string) { await this.mcp.removeManaged(id); return { removed: true }; }
}
