import { BadRequestException } from "@nestjs/common";
import { McpController } from "./mcp.controller";

describe("McpController", () => {
  it("devolve lista sem campo env e delega criação", async () => {
    const mcp = { listManaged: jest.fn().mockResolvedValue([{ id: "id", name: "notas", hasEnv: true }]), saveManaged: jest.fn().mockResolvedValue({ id: "id", name: "notas", hasEnv: true }) };
    const controller = new McpController(mcp as never);
    expect(await controller.list()).toEqual([{ id: "id", name: "notas", hasEnv: true }]);
    expect(JSON.stringify(await controller.create({ name: "notas", command: "node", args: [], enabled: true }))).not.toContain("env\"");
    expect(mcp.saveManaged).toHaveBeenCalledWith(null, expect.objectContaining({ name: "notas" }));
  });

  it("retorna erro MCP_SERVER_INVALID quando POST não traz os campos exigidos", async () => {
    const controller = new McpController({} as never);
    await expect(controller.create({ name: "notas" })).rejects.toBeInstanceOf(BadRequestException);
  });
});
