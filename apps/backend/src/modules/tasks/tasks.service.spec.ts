import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { TasksService } from "./tasks.service";

const validId = "550e8400-e29b-41d4-a716-446655440000";
const record = { id: validId, ownerId: "person-1", title: "Title", description: "", status: "aberta", createdAt: new Date(), updatedAt: new Date() };
function setup(query = jest.fn()) {
  const database = { getPool: () => ({ query }) } as unknown as DatabaseService;
  return { service: new TasksService(database), query };
}

describe("TasksService", () => {
  it("lists only the owner's non-archived tasks", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [record] }));
    await expect(service.list("person-1")).resolves.toEqual([record]);
    expect(query.mock.calls[0]?.[0]).toContain("WHERE owner_id=$1 AND status<>'arquivada'");
    expect(query.mock.calls[0]?.[1]).toEqual(["person-1"]);
  });

  it("creates a task with a generated id and default description", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rows: [record] }));
    await expect(service.create("person-1", { title: "Title" })).resolves.toEqual(record);
    expect(query.mock.calls[0]?.[1]).toEqual([expect.any(String), "person-1", "Title", ""]);
  });

  it.each([
    ["empty", ""], ["spaces", "   "], ["long", "x".repeat(121)], ["padded", " Title "],
  ])("rejects %s title before querying", async (_name, title) => {
    const { service, query } = setup();
    await expect(service.create("person-1", { title })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects invalid descriptions before querying", async () => {
    const { service, query } = setup();
    await expect(service.create("person-1", { title: "Title", description: "x".repeat(2001) })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["update", "archive"] as const)("returns the same not found for malformed %s id without query", async (method) => {
    const { service, query } = setup();
    const action = method === "update" ? service.update("person-1", "abc", { title: "Valid" }) : service.archive("person-1", "abc");
    await expect(action).rejects.toBeInstanceOf(NotFoundException);
    await expect(action).rejects.toMatchObject({ response: { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." } });
    expect(query).not.toHaveBeenCalled();
  });

  it("updates only by id and owner, and hides missing or foreign tasks", async () => {
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ ...record, title: "Changed" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { service } = setup(query);
    await expect(service.update("person-1", validId, { title: "Changed" })).resolves.toMatchObject({ title: "Changed" });
    for (const owner of ["person-2", "person-1"]) {
      await expect(service.update(owner, validId, { title: "Changed" })).rejects.toMatchObject({ response: { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." } });
    }
    expect(query.mock.calls[0]?.[0]).toContain("WHERE id=$1 AND owner_id=$2");
    expect(query.mock.calls[0]?.[1]).toEqual([validId, "person-1", "Changed"]);
  });

  it.each([{ status: "pending" }, {}])("rejects invalid or empty patch before query", async (patch) => {
    const { service, query } = setup();
    await expect(service.update("person-1", validId, patch)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("archives through the owner-scoped update", async () => {
    const { service, query } = setup(jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ ...record, status: "arquivada" }] }));
    await expect(service.archive("person-1", validId)).resolves.toMatchObject({ status: "arquivada" });
    expect(query.mock.calls[0]?.[0]).toContain("WHERE id=$1 AND owner_id=$2");
    expect(query.mock.calls[0]?.[1]).toEqual([validId, "person-1", "arquivada"]);
  });
});
