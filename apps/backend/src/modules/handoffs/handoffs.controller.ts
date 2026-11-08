import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { HandoffsService } from "./handoffs.service";

@Controller("handoffs")
export class HandoffsController {
  constructor(private readonly handoffs: HandoffsService) {}

  /** Delegação de uma conversa para outro agente. Respeita o limite de profundidade. */
  @Post()
  create(@Body() body: { conversationId?: unknown; fromAgentId?: unknown; toAgentId?: unknown; reason?: unknown }) {
    if (typeof body?.conversationId !== "string" || typeof body?.toAgentId !== "string") {
      throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa e o agente de destino." });
    }
    return this.handoffs.create({
      conversationId: body.conversationId,
      toAgentId: body.toAgentId,
      fromAgentId: typeof body.fromAgentId === "string" ? body.fromAgentId : null,
      reason: typeof body.reason === "string" ? body.reason : "",
    });
  }

  @Get()
  list(@Query("conversationId") conversationId?: string) {
    if (!conversationId) throw new BadRequestException({ code: "INVALID_HANDOFF", message: "Informe a conversa." });
    return this.handoffs.listForConversation(conversationId);
  }
}
