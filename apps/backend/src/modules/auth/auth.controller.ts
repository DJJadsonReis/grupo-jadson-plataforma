import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "./public.decorator";
import { OidcService } from "./oidc.service";
import { UsersService } from "./users.service";

/**
 * Entrada com conta de provedor. Tudo aqui é público (o desktop ainda não tem sessão).
 * O login só funciona para e-mails de pessoas já cadastradas e ativas.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly oidc: OidcService, private readonly users: UsersService) {}

  @Public()
  @Get("providers")
  providers() {
    return this.oidc.providers();
  }

  @Public()
  @Get("login/:provider")
  async login(@Param("provider") provider: string, @Res() res: Response) {
    try {
      res.redirect(await this.oidc.startLogin(provider));
    } catch {
      res.redirect(this.oidc.desktopReturn({ error: "provedor_indisponivel" }));
    }
  }

  @Public()
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
        res.redirect(this.oidc.desktopReturn({ error: "sem_acesso" }));
        return;
      }
      const session = await this.users.createSession(person.id, provider);
      res.redirect(this.oidc.desktopReturn({ session }));
    } catch {
      res.redirect(this.oidc.desktopReturn({ error: "falhou" }));
    }
  }
}
