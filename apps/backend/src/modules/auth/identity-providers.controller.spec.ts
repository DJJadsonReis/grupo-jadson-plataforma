import { IdentityProvidersController } from "./identity-providers.controller";
import { identityProviderStatus } from "./identity-providers.service";

describe("IdentityProvidersController", () => {
  it("returns the provider status without exposing credentials", () => {
    const result = new IdentityProvidersController().list();
    expect(result).toEqual(identityProviderStatus());
  });

  it("marks the endpoint as admin-only and team-only", () => {
    const { ADMIN_ONLY_ROUTE } = require("./roles") as typeof import("./roles");
    const { TEAM_ONLY_ROUTE } = require("../../common/personal-edition.guard") as typeof import("../../common/personal-edition.guard");
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, IdentityProvidersController)).toBe(true);
    expect(Reflect.getMetadata(TEAM_ONLY_ROUTE, IdentityProvidersController)).toBe(true);
  });
});
