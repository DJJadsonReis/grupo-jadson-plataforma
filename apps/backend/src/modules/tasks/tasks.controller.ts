import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { TaskInput, TaskPatch, TasksService } from "./tasks.service";

interface PrincipalRequest { principal: Principal }

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Req() request: PrincipalRequest) { return this.tasks.list(request.principal.id); }

  @Post()
  create(@Body() body: TaskInput, @Req() request: PrincipalRequest) { return this.tasks.create(request.principal.id, body); }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: TaskPatch, @Req() request: PrincipalRequest) { return this.tasks.update(request.principal.id, id, body); }
}
