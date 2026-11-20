import { ModelProvidersController } from "./model-providers.controller";
import { ADMIN_ONLY_ROUTE } from "../auth/roles";

describe("ModelProvidersController", () => {
  it("protege operações administrativas e permite seletor separado", () => {
    const controller = new ModelProvidersController({} as never);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ModelProvidersController.prototype.list)).toBe(true);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ModelProvidersController.prototype.create)).toBe(true);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ModelProvidersController.prototype.test)).toBe(true);
    expect(Reflect.getMetadata(ADMIN_ONLY_ROUTE, ModelProvidersController.prototype.selectable)).toBeUndefined();
    expect(controller).toBeDefined();
  });
});
