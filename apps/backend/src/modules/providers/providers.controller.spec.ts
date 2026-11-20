import { ProvidersController } from "./providers.controller";

describe("ProvidersController", () => {
  it("entrega o catálogo do serviço", async () => {
    const catalogue = [{ id: "openai", models: [] }];
    const controller = new ProvidersController({ catalogue: async () => catalogue } as never);
    await expect(controller.catalogue()).resolves.toBe(catalogue);
  });
});
