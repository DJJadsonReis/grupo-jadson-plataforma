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
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["instructions", "responseStyle", "owner"].includes(key))) {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "O corpo contém campos inválidos." });
    }
    if (input.instructions !== undefined && typeof input.instructions !== "string") {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Instruções devem ser um texto com até 3000 caracteres." });
    }
    if (input.instructions !== undefined && input.instructions.length > 3000) {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Instruções devem ter até 3000 caracteres." });
    }
    if (input.responseStyle !== undefined && !["concise", "balanced", "detailed"].includes(input.responseStyle as string)) {
      throw new BadRequestException({ code: "INVALID_PREFERENCES", message: "Estilo de resposta inválido." });
    }
    const preferences: { instructions?: string; responseStyle?: "concise" | "balanced" | "detailed" } = {};
    if (input.instructions !== undefined) preferences.instructions = input.instructions as string;
    if (input.responseStyle !== undefined) preferences.responseStyle = input.responseStyle as "concise" | "balanced" | "detailed";
    return this.preferences.update(request.principal?.id ?? "sistema", { ...input, ...preferences } as { instructions?: string; responseStyle?: "concise" | "balanced" | "detailed" });
  }
}
