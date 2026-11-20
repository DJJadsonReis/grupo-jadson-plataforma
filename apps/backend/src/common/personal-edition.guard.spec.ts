import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PersonalEditionGuard, TEAM_ONLY_ROUTE } from "./personal-edition.guard";

describe("PersonalEditionGuard", () => {
  const originalEdition = process.env.GRUPO_EDICAO;
  const guard = new PersonalEditionGuard(new Reflector());
  const contextFor = (teamOnly: boolean) => {
    const handler = () => undefined;
    Reflect.defineMetadata(TEAM_ONLY_ROUTE, teamOnly, handler);
    return { getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({}) }) } as unknown as ExecutionContext;
  };

  afterEach(() => {
    if (originalEdition === undefined) delete process.env.GRUPO_EDICAO;
    else process.env.GRUPO_EDICAO = originalEdition;
  });

  it("blocks marked routes in personal mode with the required response", () => {
    process.env.GRUPO_EDICAO = "pessoal";
    try {
      guard.canActivate(contextFor(true));
      throw new Error("expected guard to reject");
    } catch (error) {
      expect(error).toMatchObject({ status: 403, response: { code: "EDICAO_PESSOAL", message: "Este recurso não existe no modo pessoal." } });
    }
  });

  it("allows marked routes in team mode and unmarked routes in personal mode", () => {
    process.env.GRUPO_EDICAO = "equipe";
    expect(guard.canActivate(contextFor(true))).toBe(true);
    process.env.GRUPO_EDICAO = "pessoal";
    expect(guard.canActivate(contextFor(false))).toBe(true);
  });
});
