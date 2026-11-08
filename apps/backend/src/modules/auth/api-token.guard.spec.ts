import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_ONLY_ROUTE } from "./roles";
import { ApiTokenGuard } from "./api-token.guard";
import { IS_PUBLIC_ROUTE } from "./public.decorator";
import { Principal, UsersService } from "./users.service";

type Flags = { isPublic?: boolean; adminOnly?: boolean };

function contextWith(authorization: string | undefined, flags: Flags = {}, method = "GET") {
  const reflector = {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_ROUTE ? Boolean(flags.isPublic) : key === ADMIN_ONLY_ROUTE ? Boolean(flags.adminOnly) : false),
  } as unknown as Reflector;
  const request: { method: string; headers: Record<string, string | undefined>; principal?: Principal } = {
    method,
    headers: authorization === undefined ? {} : { authorization },
  };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, reflector, request };
}

function usersReturning(principal: Principal | null): UsersService {
  return { findByToken: async () => principal } as unknown as UsersService;
}

const SYSTEM_TOKEN = "test-token-with-enough-length-123456";

describe("ApiTokenGuard", () => {
  const original = process.env.API_TOKEN;
  beforeEach(() => { process.env.API_TOKEN = SYSTEM_TOKEN; });
  afterEach(() => {
    if (original === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = original;
  });

  it("aceita o token do sistema como administrador", async () => {
    const { ctx, reflector, request } = contextWith(`Bearer ${SYSTEM_TOKEN}`);
    expect(await new ApiTokenGuard(reflector).canActivate(ctx)).toBe(true);
    expect(request.principal?.role).toBe("admin");
  });

  it("recusa requisição sem cabeçalho", async () => {
    const { ctx, reflector } = contextWith(undefined);
    await expect(new ApiTokenGuard(reflector).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recusa token errado quando não há usuário com ele", async () => {
    const { ctx, reflector } = contextWith("Bearer outro-token");
    await expect(new ApiTokenGuard(reflector, usersReturning(null)).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("falha fechada quando API_TOKEN não está configurado", async () => {
    delete process.env.API_TOKEN;
    const { ctx, reflector } = contextWith("Bearer qualquer");
    await expect(new ApiTokenGuard(reflector).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("deixa passar rotas públicas sem token", async () => {
    const { ctx, reflector } = contextWith(undefined, { isPublic: true });
    expect(await new ApiTokenGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it("leitor consulta, mas não altera", async () => {
    const viewer: Principal = { id: "1", name: "Leitora", role: "viewer" };
    const read = contextWith("Bearer pessoal", {}, "GET");
    expect(await new ApiTokenGuard(read.reflector, usersReturning(viewer)).canActivate(read.ctx)).toBe(true);
    const write = contextWith("Bearer pessoal", {}, "POST");
    await expect(new ApiTokenGuard(write.reflector, usersReturning(viewer)).canActivate(write.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rota só de administrador recusa operador", async () => {
    const operator: Principal = { id: "2", name: "Operador", role: "operator" };
    const { ctx, reflector } = contextWith("Bearer pessoal", { adminOnly: true }, "GET");
    await expect(new ApiTokenGuard(reflector, usersReturning(operator)).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("operador faz requisições de escrita normais", async () => {
    const operator: Principal = { id: "2", name: "Operador", role: "operator" };
    const { ctx, reflector } = contextWith("Bearer pessoal", {}, "POST");
    expect(await new ApiTokenGuard(reflector, usersReturning(operator)).canActivate(ctx)).toBe(true);
  });
});
