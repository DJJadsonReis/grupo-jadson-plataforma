import { TasksController } from "./tasks.controller";

const principal = { id: "person-1", name: "Person", role: "operator" as const };

describe("TasksController", () => {
  it("uses request principal for list, create, update, and archive via PATCH", async () => {
    const tasks = { list: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new" }), update: jest.fn().mockResolvedValue({ id: "task" }), archive: jest.fn() };
    const controller = new TasksController(tasks as never);
    const request = { principal };
    await controller.list(request);
    const input = { title: "Task", description: "Details" };
    await controller.create(input, request);
    await controller.update("550e8400-e29b-41d4-a716-446655440000", { status: "arquivada" }, request);
    expect(tasks.list).toHaveBeenCalledWith("person-1");
    expect(tasks.create).toHaveBeenCalledWith("person-1", input);
    expect(tasks.update).toHaveBeenCalledWith("person-1", "550e8400-e29b-41d4-a716-446655440000", { status: "arquivada" });
  });
});
