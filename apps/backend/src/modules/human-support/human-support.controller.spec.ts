import { ForbiddenException, ConflictException } from "@nestjs/common";
import { HumanSupportController } from "./human-support.controller";

describe("HumanSupportController", () => {
  it("forwards authenticated principal and preserves 403/409 authorization and claim errors", async () => {
    const service = { list:jest.fn().mockRejectedValue(new ForbiddenException()), claim:jest.fn().mockRejectedValue(new ConflictException({ message:"Este pedido já foi assumido por outro atendente." })), resolve:jest.fn().mockRejectedValue(new ForbiddenException()) };
    const controller = new HumanSupportController(service as never);
    const viewer = { id:"viewer", name:"Leitor", role:"viewer" as const };
    await expect(controller.list({ principal:viewer })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.claim("request",{ principal:viewer })).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.resolve("request",{ principal:viewer })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).toHaveBeenCalledWith(viewer);
    expect(service.claim).toHaveBeenCalledWith("request",viewer);
    expect(service.resolve).toHaveBeenCalledWith("request",viewer);
  });
});
