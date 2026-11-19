import { BadRequestException, Body, Controller, Get, Put, Req } from "@nestjs/common";
import { UserPreferencesService } from "./user-preferences.service";

type RequestWithPrincipal = { principal?: { id: string } };

@Controller("user-preferences")
export class UserPreferencesController {
  constructor(private readonly preferences: UserPreferencesService) {}
  @Get()
  read(@Req() request: RequestWithPrincipal) { return this.preferences.read(request.principal?.id ?? "sistema"); }
  @Put()
  update(@Req() request: RequestWithPrincipal, @Body() body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Envie as preferências." });
    return this.preferences.update(request.principal?.id ?? "sistema", body as { instructions?: string; responseStyle?: "concise" | "balanced" | "detailed" });
  }
}
