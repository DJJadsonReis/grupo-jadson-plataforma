import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import { IS_PUBLIC_ROUTE } from "./public.decorator";

/**
 * Exige `Authorization: Bearer <API_TOKEN>` em todas as rotas, exceto as marcadas com @Public().
 * Sem API_TOKEN configurado, todas as rotas protegidas são recusadas (falha fechada).
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const expected = process.env.API_TOKEN ?? "";
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = request.headers.authorization ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

    if (!expected || !safeEqual(provided, expected)) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Token de API ausente ou inválido." });
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
