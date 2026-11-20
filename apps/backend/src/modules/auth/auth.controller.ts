import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { Public } from "./public.decorator";
import { OidcService } from "./oidc.service";
import { UsersService } from "./users.service";
import { PersonalEditionGuard, TeamOnly } from "../../common/personal-edition.guard";

/**
 * Entrada com conta de provedor. Tudo aqui é público (o desktop ainda não tem sessão).
 * O login só funciona para e-mails de pessoas já cadastradas e ativas.
 */
@Controller("auth")
@UseGuards(PersonalEditionGuard)
export class AuthController {
  constructor(private readonly oidc: OidcService, private readonly users: UsersService) {}

  @Public()
  @TeamOnly()
  @Get("providers")
  providers() {
    return this.oidc.providers();
  }

  @Get("me") me(@Req() request: { principal?: { id: string; name: string; role: string } }) {
    return request.principal ?? { id: "sistema", name: "Administrador", role: "admin" };
  }

  /** `return` é o endereço loopback do desktop (http://127.0.0.1:<porta>/cb). Outro endereço é recusado. */
  @Public()
  @TeamOnly()
  @Get("login/:provider")
  async login(@Param("provider") provider: string, @Query("return") returnUri: string | undefined, @Res() res: Response) {
    try {
      res.redirect(await this.oidc.startLogin(provider, returnUri ?? null));
    } catch {
      res.redirect(this.oidc.desktopReturn({ error: "provedor_indisponivel" }, returnUri ? null : undefined));
    }
  }

  @Public()
  @TeamOnly()
  @Get("callback/:provider")
  async callback(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    if (error || !code || !state) {
      res.redirect(this.oidc.desktopReturn({ error: error ? "cancelado" : "resposta_invalida" }));
      return;
    }
    try {
      const identity = await this.oidc.finishLogin(provider, code, state);
      const person = await this.users.findActiveByEmail(identity.email);
      if (!person) {
        res.redirect(this.oidc.desktopReturn({ error: "sem_acesso" }, identity.returnUri));
        return;
      }
      const session = await this.users.createSession(person.id, provider);
      res.redirect(this.oidc.desktopReturn({ session }, identity.returnUri));
    } catch {
      res.redirect(this.oidc.desktopReturn({ error: "falhou" }));
    }
  }
}
