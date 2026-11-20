import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { EditionController } from "./edition.controller";
import { EditionModule } from "./edition.module";
import { Module } from "@nestjs/common";
import { ApiTokenGuard } from "../auth/api-token.guard";
import { PersonalEditionGuard } from "../../common/personal-edition.guard";
import { Reflector } from "@nestjs/core";
import { TeamsController } from "../agents/teams.controller";
import { AgentPermissionsService } from "../agents/agent-permissions.service";
import { AgentsController } from "../agents/agents.controller";
import { AgentsService } from "../agents/agents.service";

@Module({
  controllers: [AgentsController, TeamsController],
  providers: [
    PersonalEditionGuard,
    { provide: AgentPermissionsService, useValue: {} },
    { provide: AgentsService, useValue: {} },
  ],
})
class AgentAuthProbeModule {}

describe("EditionController", () => {
  const originalEdition = process.env.GRUPO_EDICAO;
  const originalToken = process.env.API_TOKEN;
  let app: INestApplication | undefined;

  afterEach(() => {
    void app?.close();
    app = undefined;
    if (originalEdition === undefined) delete process.env.GRUPO_EDICAO;
    else process.env.GRUPO_EDICAO = originalEdition;
    if (originalToken === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = originalToken;
  });

  it.each([[undefined, "equipe"], ["equipe", "equipe"], ["pessoal", "pessoal"]] as const)("returns %s edition as %s through the Nest module without auth", async (value, expected) => {
    if (value === undefined) delete process.env.GRUPO_EDICAO;
    else process.env.GRUPO_EDICAO = value;
    const module = await Test.createTestingModule({ imports: [EditionModule] })
      .overrideGuard(ApiTokenGuard).useValue({ canActivate: () => true })
      .overrideGuard(PersonalEditionGuard).useValue({ canActivate: () => true })
      .compile();
    expect(module.get(EditionController).getEdition()).toEqual({ edition: expected });
    await module.close();
  });

  it("serves public edition and still requires a token on the real agents route", async () => {
    process.env.GRUPO_EDICAO = "pessoal";
    process.env.API_TOKEN = "test-token-with-enough-length-123456";
    const module = await Test.createTestingModule({ imports: [EditionModule, AgentAuthProbeModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalGuards(new ApiTokenGuard(module.get(Reflector)), new PersonalEditionGuard(module.get(Reflector)));
    await app.listen(0, "127.0.0.1");
    const server = app.getHttpServer();
    const address = server.address() as { port: number };
    const request = await import("node:http").then(({ request: httpRequest }) => ({
      get: (path: string) => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port: address.port, path, method: "GET" }, (response) => {
          let data = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => { data += chunk; });
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body: data ? JSON.parse(data) : undefined }));
        });
        req.on("error", reject);
        req.end();
      }),
      withToken: (path: string) => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port: address.port, path, method: "GET", headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } }, (response) => {
          let data = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => { data += chunk; });
          response.on("end", () => resolve({ status: response.statusCode ?? 0, body: data ? JSON.parse(data) : undefined }));
        });
        req.on("error", reject);
        req.end();
      }),
    }));
    expect(await request.get("/api/v1/edition")).toEqual({ status: 200, body: { edition: "pessoal" } });
    expect(await request.get("/api/v1/agents")).toMatchObject({ status: 401 });
    expect(await request.withToken("/api/v1/teams")).toMatchObject({ status: 403, body: { code: "EDICAO_PESSOAL", message: "Este recurso não existe no modo pessoal." } });
    expect(await request.withToken("/api/v1/agents/123e4567-e89b-42d3-a456-426614174000/shares")).toMatchObject({ status: 403, body: { code: "EDICAO_PESSOAL", message: "Este recurso não existe no modo pessoal." } });
  });
});
