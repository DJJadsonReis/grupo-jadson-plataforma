import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";

describe("AppModule dependency graph", () => {
  it("compiles all application modules", async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();

    await module.close();
  });
});
