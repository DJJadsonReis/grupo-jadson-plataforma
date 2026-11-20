import { TeamRoomsController } from "./team-rooms.controller";

describe("TeamRoomsController", () => {
  it("delegates authenticated room operations", async () => {
    const rooms = { list: jest.fn().mockResolvedValue([]), people: jest.fn().mockResolvedValue([]) };
    const controller = new TeamRoomsController(rooms as never);
    const principal = { id: "person", name: "Ana", role: "viewer" as const };
    await expect(controller.list({ principal })).resolves.toEqual([]);
    await expect(controller.people()).resolves.toEqual([]);
    expect(rooms.list).toHaveBeenCalledWith(principal);
  });
});
