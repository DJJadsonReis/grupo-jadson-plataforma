import { BadRequestException, Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { AdminOnly } from "./roles";
import { Role, UsersService } from "./users.service";

/** Gerenciamento de pessoas e papéis: só administradores. */
@AdminOnly()
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  /** Cria uma pessoa. O token aparece só nesta resposta; guarde-o com cuidado. */
  @Post()
  create(@Body() body: { name?: unknown; role?: unknown }) {
    if (typeof body?.name !== "string" || typeof body?.role !== "string") {
      throw new BadRequestException({ code: "INVALID_USER", message: "Informe nome e papel." });
    }
    return this.users.create({ name: body.name, role: body.role as Role });
  }

  @Put(":id/role")
  setRole(@Param("id") id: string, @Body() body: { role?: unknown }) {
    if (typeof body?.role !== "string") throw new BadRequestException({ code: "INVALID_USER", message: "Informe o papel." });
    return this.users.setRole(id, body.role as Role);
  }

  @Put(":id/active")
  setActive(@Param("id") id: string, @Body() body: { active?: unknown }) {
    if (typeof body?.active !== "boolean") throw new BadRequestException({ code: "INVALID_USER", message: "Informe true ou false." });
    return this.users.setActive(id, body.active);
  }

  /** Troca o token da pessoa; o antigo para de funcionar na hora. */
  @Post(":id/token")
  rotate(@Param("id") id: string) {
    return this.users.rotateToken(id);
  }
}
