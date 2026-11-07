import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiTokenGuard } from "./api-token.guard";

function contextWith(authorization: string | undefined, isPublic = false): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization === undefined ? {} : { authorization } }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe("ApiTokenGuard", () => {
  const original = process.env.API_TOKEN;
  beforeEach(() => { process.env.API_TOKEN = "test-token-with-enough-length-123456"; });
  afterEach(() => {
    if (original === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = original;
    jest.restoreAllMocks();
  });

  it("allows the request when the bearer token matches", () => {
    const { ctx, reflector } = contextWith("Bearer test-token-with-enough-length-123456");
    expect(new ApiTokenGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it("rejects a missing header", () => {
    const { ctx, reflector } = contextWith(undefined);
    expect(() => new ApiTokenGuard(reflector).canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects a wrong token", () => {
    const { ctx, reflector } = contextWith("Bearer outro-token");
    expect(() => new ApiTokenGuard(reflector).canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("fails closed when API_TOKEN is not configured", () => {
    delete process.env.API_TOKEN;
    const { ctx, reflector } = contextWith("Bearer qualquer");
    expect(() => new ApiTokenGuard(reflector).canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("lets public routes through without a token", () => {
    const { ctx, reflector } = contextWith(undefined, true);
    expect(new ApiTokenGuard(reflector).canActivate(ctx)).toBe(true);
  });
});
