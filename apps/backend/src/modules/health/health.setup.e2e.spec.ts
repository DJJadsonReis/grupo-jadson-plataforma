import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiTokenGuard } from "../auth/api-token.guard";
import { DatabaseService } from "../database/database.service";
import { HealthController } from "./health.controller";
import { QueueService } from "../queue/queue.service";
import { RedisService } from "../redis/redis.service";

describe("desktop setup and backend health integration", () => {
  it("accepts the repaired setup token on health and rejects requests without it", async () => {
    const old = { token: process.env.API_TOKEN, setupPath: process.env.GJ_DESKTOP_SETUP_PATH };
    const directory = mkdtempSync(join(tmpdir(), "gj-health-setup-"));
    const setupPath = join(directory, "setup.json");
    const token = "f".repeat(64);
    process.env.API_TOKEN = "stale-backend-token";
    process.env.GJ_DESKTOP_SETUP_PATH = setupPath;
    const database = { checkConnection: jest.fn().mockResolvedValue(false), isVectorReady: jest.fn().mockReturnValue(false) };
    const redis = { checkConnection: jest.fn().mockResolvedValue(false) };
    const queue = { getDriver: jest.fn().mockReturnValue("process-memory") };
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DatabaseService, useValue: database },
        { provide: RedisService, useValue: redis },
        { provide: QueueService, useValue: queue },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalGuards(new ApiTokenGuard(new Reflector()));
    try {
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as { port: number };
      const url = `http://127.0.0.1:${address.port}/api/v1/health`;
      expect((await fetch(url)).status).toBe(401);

      // Simula o arquivo criado pelo comando Tauri ensure_desktop_setup.
      writeFileSync(setupPath, JSON.stringify({ databaseUrl: "postgres://localhost/test", apiToken: token }));
      const accepted = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({ status: "ok" });
      expect((await fetch(url)).status).toBe(401);
    } finally {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
      if (old.token === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = old.token;
      if (old.setupPath === undefined) delete process.env.GJ_DESKTOP_SETUP_PATH;
      else process.env.GJ_DESKTOP_SETUP_PATH = old.setupPath;
    }
  });
});
