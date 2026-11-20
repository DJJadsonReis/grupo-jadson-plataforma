import { ConnectionSharesController } from "./connection-shares.controller";
import { TEAM_ONLY_ROUTE } from "../../common/personal-edition.guard";
import { ADMIN_ONLY_ROUTE } from "../auth/roles";
describe("ConnectionSharesController", () => {
  it("delegates the authenticated principal", async () => {
    const shares = { list: jest.fn().mockResolvedValue({ outgoing: [], incoming: [] }) };
    const controller = new ConnectionSharesController(shares as never);
    const principal = { id: "id", name: "Ana", role: "operator" as const };
    await controller.list({ principal });
    expect(shares.list).toHaveBeenCalledWith(principal);
  });
  it("marks the controller team-only and administrative routes admin-only", () => {
    expect(Reflect.getMetadata(TEAM_ONLY_ROUTE, ConnectionSharesController)).toBe(true);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ConnectionSharesController.prototype.pending)).toBe(true);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ConnectionSharesController.prototype.approve)).toBe(true);
  });
});
