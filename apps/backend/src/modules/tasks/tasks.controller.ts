import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Optional } from "@nestjs/common";
import { Principal } from "../auth/users.service";
import { TaskInput, TaskPatch, TasksService } from "./tasks.service";
import { TaskQueueService } from "./task-queue.service";

interface PrincipalRequest { principal: Principal }

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService, @Optional() private readonly queue?: TaskQueueService) {}

  @Get()
  list(@Req() request: PrincipalRequest) { return this.tasks.list(request.principal.id); }

  @Post()
  create(@Body() body: TaskInput, @Req() request: PrincipalRequest) { return this.tasks.create(request.principal.id, body); }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: TaskPatch, @Req() request: PrincipalRequest) { return this.tasks.update(request.principal.id, id, body); }

  @Post(":id/queue")
  enqueue(@Param("id") id: string, @Body() body: { agentId: string }, @Req() request: PrincipalRequest) { return this.queue!.enqueue(request.principal.id, id, body?.agentId); }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() request: PrincipalRequest) { return this.queue!.cancel(request.principal.id, id); }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Req() request: PrincipalRequest) { return this.queue!.retry(request.principal.id, id); }
}
