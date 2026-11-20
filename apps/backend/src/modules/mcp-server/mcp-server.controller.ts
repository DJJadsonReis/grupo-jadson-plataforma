import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ErrorRequestHandler, Request, Response } from "express";
import { Public } from "../auth/public.decorator";
import { Principal } from "../auth/users.service";
import { AuditService } from "../audit/audit.service";
import { McpServerTokensService } from "./mcp-server-tokens.service";
import { McpServerTools } from "./mcp-server-tools";
import { handleJsonRpc } from "./mcp-server-protocol";

type AuthedRequest = Request & { principal?: Principal; rawBodyLength?: number };

export const mcpServerBodyParserError: ErrorRequestHandler = (error: unknown, request, response, next) => {
  const failure = error as { type?: string };
  if (request.path === "/api/v1/mcp-server" && failure?.type === "entity.parse.failed") {
    response.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Erro ao analisar JSON." } });
    return;
  }
  if (request.path === "/api/v1/mcp-server" && failure?.type === "entity.too.large") {
    response.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "O corpo excede 64 KB." } });
    return;
  }
  next(error);
};

@Controller("mcp-server")
export class McpServerController {
  constructor(private readonly tokens: McpServerTokensService, private readonly tools: McpServerTools, private readonly audit: AuditService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async rpc(@Req() request: Request, @Body() body: unknown, @Res() response: Response) {
    const authorization = request.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const resolved = token ? await this.tokens.resolve(token) : null;
    if (!resolved) throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Token MCP ausente ou inválido." });
    const principal: Principal = { id: resolved.ownerId, name: resolved.name, role: resolved.role };
    let size: number;
    try { size = (request as AuthedRequest).rawBodyLength ?? Buffer.byteLength(JSON.stringify(body) ?? "", "utf8"); } catch { size = 65_537; }
    if (size > 65_536) return response.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "O corpo excede 64 KB." } });
    const protocol = await handleJsonRpc(body, {
      tools: {
        definitions: () => this.tools.definitions(),
        resources: () => this.tools.resources(principal),
        readAgentResource: (uri) => this.tools.readAgentResource(uri, principal),
        invalidCall: () => this.audit.record({ actor: resolved.ownerId, action: "mcp.call", subject: "(inválida)", details: { token: `…${resolved.tokenId.slice(-6)}`, result: -32602 } }),
        call: async (name, args) => {
          try {
            const result = await this.tools.call(name, args, principal);
            await this.audit.record({ actor: resolved.ownerId, action: "mcp.call", subject: name, details: { token: `…${resolved.tokenId.slice(-6)}`, result: "ok" } });
            return result;
          } catch (error) {
            const code = error instanceof HttpException ? error.getStatus() : typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : -32603;
            await this.audit.record({ actor: resolved.ownerId, action: "mcp.call", subject: name, details: { token: `…${resolved.tokenId.slice(-6)}`, result: code } });
            throw error;
          }
        },
      },
    });
    if (protocol === null) return response.status(202).end();
    return response.status(200).json(protocol);
  }

  @Get("tokens")
  listTokens(@Req() request: AuthedRequest) { return this.tokens.list(this.principal(request).id); }

  @Post("tokens")
  async createToken(@Req() request: AuthedRequest, @Body() body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).name !== "string") throw new BadRequestException("Informe o nome do token.");
    return this.tokens.create(this.principal(request).id, (body as { name: string }).name);
  }

  @Delete("tokens/:id")
  async revokeToken(@Req() request: AuthedRequest, @Param("id") id: string) {
    if (!await this.tokens.revoke(this.principal(request).id, id)) throw new BadRequestException("Token não encontrado.");
    return { revoked: true };
  }

  private principal(request: AuthedRequest): Principal {
    if (!request.principal) throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Sessão ausente." });
    return request.principal;
  }
}
