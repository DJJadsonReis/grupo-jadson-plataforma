import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isPersonalEdition } from "./edition";

export const TEAM_ONLY_ROUTE = "grupo-jadson:team-only";
export const TeamOnly = () => SetMetadata(TEAM_ONLY_ROUTE, true);

@Injectable()
export class PersonalEditionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(TEAM_ONLY_ROUTE, [context.getHandler(), context.getClass()])) return true;
    if (!isPersonalEdition()) return true;
    throw new ForbiddenException({ code: "EDICAO_PESSOAL", message: "Este recurso não existe no modo pessoal." });
  }
}
