import { BadRequestException, Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";

interface PrincipalRequest { principal?: Principal }
import { HandoffsService } from "./handoffs.service";

@Controller("handoffs")
export class HandoffsController {
  constructor(private readonly handoffs: HandoffsService) {}

  /** Delegação de uma conversa para outro agente. Respeita o limite de profundidade. */
  @Post()
  create(@Body() body: { conversationId?: unknown; fromAgentId?: unknown; toAgentId?: unknown; reason?: unknown }, @Req() request: PrincipalRequest) {
    if (typeof body?.conversationId !== "string" || typeof body?.toAgentId !== "string") {
      throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa e o agente de destino." });
    }
    return this.handoffs.create({
      conversationId: body.conversationId,
      toAgentId: body.toAgentId,
      fromAgentId: typeof body.fromAgentId === "string" ? body.fromAgentId : null,
      reason: typeof body.reason === "string" ? body.reason : "",
    }, request.principal ?? { id: "sistema", name: "Administrador", role: "admin" });
  }

  @Get()
  list(@Query("conversationId") conversationId: string | undefined, @Req() request: PrincipalRequest) {
    if (!conversationId) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa." });
    return this.handoffs.listForConversation(conversationId, request.principal ?? { id: "sistema", name: "Administrador", role: "admin" });
  }
}
