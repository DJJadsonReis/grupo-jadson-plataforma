import { describe, expect, it } from "vitest";
import { buildMcpClientConfig, mcpTokenLastUsed, mcpTokenStatus } from "./mcp-server-config";

describe("configuração do servidor MCP", () => {
  it("usa placeholder e nunca inclui token real", () => {
    const config = buildMcpClientConfig("http://127.0.0.1:3333/api/v1");
    expect(config).toContain("<SEU_TOKEN>");
    expect(config).not.toContain("gjm_");
    expect(JSON.parse(config).url).toBe("http://127.0.0.1:3333/api/v1/mcp-server");
  });
  it("formata status e data de uso", () => {
    expect(mcpTokenStatus(null)).toBe("Ativo");
    expect(mcpTokenStatus("2026-01-01T00:00:00.000Z")).toBe("Revogado");
    expect(mcpTokenLastUsed(null)).toBe("Nunca usado");
  });
});
