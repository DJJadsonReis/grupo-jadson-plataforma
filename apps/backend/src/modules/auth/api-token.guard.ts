import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import { ADMIN_ONLY_ROUTE } from "./roles";
import { IS_PUBLIC_ROUTE } from "./public.decorator";
import { Principal, UsersService } from "./users.service";

type AuthedRequest = { method: string; headers: Record<string, string | undefined>; principal?: Principal };

/**
 * Autentica cada requisição por `Authorization: Bearer <token>`, exceto rotas @Public().
 *
 * Dois tipos de token: o token do sistema (API_TOKEN, usado pelo desktop local) age como
 * administrador; o token de cada pessoa tem o papel dela. Leitor só faz GET. Rotas marcadas
 * com @AdminOnly() exigem administrador. Sem token válido, a requisição é recusada.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Optional() private readonly users?: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const expected = process.env.API_TOKEN ?? "";

    let principal: Principal | null = null;
    if (expected && safeEqual(provided, expected)) {
      principal = { id: "sistema", name: "Administrador", role: "admin" };
    } else if (provided && this.users) {
      principal = await this.users.findByToken(provided);
    }
    if (!principal) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Token de API ausente ou inválido." });
    }
    request.principal = principal;

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_ROUTE, [context.getHandler(), context.getClass()]);
    if (adminOnly && principal.role !== "admin") {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Esta ação é só para administradores." });
    }
    if (principal.role === "viewer" && request.method !== "GET") {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Leitores só podem consultar." });
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
