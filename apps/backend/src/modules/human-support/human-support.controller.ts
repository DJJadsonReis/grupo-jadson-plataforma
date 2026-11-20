import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { HumanSupportService } from "./human-support.service";

@Controller("human-support")
export class HumanSupportController {
  constructor(private readonly service: HumanSupportService) {}
  @Get() list(@Req() req: { principal?: Principal }) { return this.service.list(req.principal ?? { id:"sistema", name:"Administrador", role:"admin" }); }
  @Post(":id/claim") claim(@Param("id") id: string, @Req() req: { principal?: Principal }) { return this.service.claim(id, req.principal ?? { id:"sistema", name:"Administrador", role:"admin" }); }
  @Post(":id/resolve") resolve(@Param("id") id: string, @Req() req: { principal?: Principal }) { return this.service.resolve(id, req.principal ?? { id:"sistema", name:"Administrador", role:"admin" }); }
}
