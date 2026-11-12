import { BadRequestException, Controller, Delete, Get, Query, Req } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { GoogleService } from "./google.service";

interface RequestWithPrincipal {
  principal?: { id: string };
}

/** Conexão da pessoa com o Google (Drive e Agenda). */
@Controller("google")
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get("connect")
  connect(@Req() request: RequestWithPrincipal) {
    return { url: this.google.connectUrl(this.userId(request)) };
  }

  /** Google devolve a pessoa aqui depois de autorizar. Não tem token: a validação é o `state` de uso único. */
  @Public()
  @Get("callback")
  async callback(@Query("code") code?: string, @Query("state") state?: string, @Query("error") error?: string) {
    if (error) return page("Conexão cancelada", "Você não autorizou o acesso ao Google. Pode fechar esta janela.");
    if (!code || !state) throw new BadRequestException({ code: "INVALID_CALLBACK", message: "Resposta do Google incompleta." });
    await this.google.finishConnect(code, state);
    return page("Google conectado", "Pode voltar ao Grupo Jadson e fechar esta janela.");
  }

  @Get("status")
  status(@Req() request: RequestWithPrincipal) {
    return this.google.status(this.userId(request));
  }

  @Delete("connection")
  async disconnect(@Req() request: RequestWithPrincipal) {
    await this.google.disconnect(this.userId(request));
    return { connected: false };
  }

  private userId(request: RequestWithPrincipal): string {
    const id = request.principal?.id;
    if (!id) throw new BadRequestException({ code: "NO_PRINCIPAL", message: "Sessão sem identificação." });
    return id;
  }
}

function page(title: string, text: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:Segoe UI,sans-serif;background:#0b0b0b;color:#f5f2ea;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h2 style="color:#f5ce55">${title}</h2><p>${text}</p></div></body>`;
}
