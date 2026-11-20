import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { AdminOnly } from "../auth/roles";
import { ModelProviderInput, ModelProvidersService } from "./model-providers.service";

@Controller("model-providers")
export class ModelProvidersController {
  constructor(private readonly providers: ModelProvidersService) {}
  @AdminOnly() @Get() list() { return this.providers.list(); }
  @Get("selectable") selectable() { return this.providers.selectable(); }
  @AdminOnly() @Post() @HttpCode(HttpStatus.CREATED) create(@Body() body: ModelProviderInput) { return this.providers.create(body); }
  @AdminOnly() @Patch(":id") patch(@Param("id") id: string, @Body() body: ModelProviderInput) { return this.providers.patch(id, body); }
  @AdminOnly() @Delete(":id") @HttpCode(HttpStatus.NO_CONTENT) async remove(@Param("id") id: string) { await this.providers.remove(id); }
  @AdminOnly() @Post(":id/test") test(@Param("id") id: string) { return this.providers.test(id); }
}
