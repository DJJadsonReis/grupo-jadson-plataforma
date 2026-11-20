import { NotFoundException } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

describe("NotificationsController", () => {
  const records: { id: string; owner: string; readAt: string | null }[] = [
    { id: "a1", owner: "a", readAt: null },
    { id: "a2", owner: "a", readAt: null },
    { id: "b1", owner: "b", readAt: null },
  ];
  let controller: NotificationsController;
  let service: NotificationsService;
  beforeEach(() => {
    const pool = { query: jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("UPDATE notifications SET read_at=now() WHERE id=")) {
        const row = records.find((item) => item.id === values[0] && item.owner === values[1] && item.readAt === null);
        if (!row) return { rowCount: 0, rows: [] };
        row.readAt = "now";
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith("UPDATE notifications SET read_at=now() WHERE owner=")) {
        const rows = records.filter((item) => item.owner === values[0] && item.readAt === null);
        rows.forEach((row) => { row.readAt = "now"; });
        return { rowCount: rows.length, rows: [] };
      }
      if (sql.startsWith("SELECT")) return { rowCount: 0, rows: records.filter((item) => item.owner === values[0] && item.readAt === null) };
      throw new Error("Consulta inesperada");
    }) };
    service = new NotificationsService({ getPool: () => pool } as never);
    controller = new NotificationsController(service);
  });

  it("lista e marca apenas notificações do principal da requisição", async () => {
    expect(await controller.list({ principal: { id: "a" } })).toHaveLength(2);
    await expect(controller.read("b1", { principal: { id: "a" } })).rejects.toBeInstanceOf(NotFoundException);
    expect(records.find((item) => item.id === "b1")?.readAt).toBeNull();
  });

  it("read-all marca apenas as notificações não lidas da pessoa autenticada", async () => {
    expect(await controller.readAll({ principal: { id: "a" } })).toEqual({ read: 2 });
    expect(records.find((item) => item.id === "b1")?.readAt).toBeNull();
    expect(await controller.list({ principal: { id: "b" } })).toHaveLength(1);
  });
});
