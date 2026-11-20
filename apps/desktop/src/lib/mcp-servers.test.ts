import { describe, expect, it, vi } from "vitest";
import { buildMcpServerPayload, listMcpServers, saveMcpServer, validateMcpUrl, type McpServerDraft } from "./mcp-servers";

describe("buildMcpServerPayload", () => {
  const valid: McpServerDraft = { name: "notas", transport: "stdio", command: "node", argsText: "worker.js", url: "", headers: {}, env: {}, enabled: true };
  it("rejeita nome inválido", () => { expect(() => buildMcpServerPayload({ ...valid, name: "Inválido" })).toThrow(); });
  it("rejeita comando com espaço", () => { expect(() => buildMcpServerPayload({ ...valid, command: "node --bad" })).toThrow(); });
  it("monta argumentos por linha e omite env vazio", () => { expect(buildMcpServerPayload(valid)).toEqual({ name: "notas", transport: "stdio", command: "node", args: ["worker.js"], enabled: true }); });
  it("valida URLs seguras e bloqueia HTTP externo e credenciais", () => {
    expect(validateMcpUrl("https://mcp.example.com/endpoint").protocol).toBe("https:");
    expect(validateMcpUrl("http://127.0.0.1:4312/mcp").hostname).toBe("127.0.0.1");
    for (const url of ["http://example.com", "https://user:pass@example.com/mcp", "https://example.com/mcp#fragment", "https://169.254.10.1/mcp"]) expect(() => validateMcpUrl(url)).toThrow();
  });
  it("monta payload remoto com URL e cabeçalho apenas para envio", () => {
    expect(buildMcpServerPayload({ ...valid, transport: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer fake" } })).toEqual({ name: "notas", transport: "http", url: "https://mcp.example.com/mcp", enabled: true, headers: { Authorization: "Bearer fake" } });
  });
  it("bloqueia nome e comando inválidos antes de chamar fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(saveMcpServer(fetcher, "/mcp/servers", { ...valid, name: "N" })).rejects.toThrow();
    await expect(saveMcpServer(fetcher, "/mcp/servers", { ...valid, command: "node --bad" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("remove qualquer campo env inesperado ao receber a lista", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => [{ id: "1", name: "notas", env: { token: "segredo" }, hasEnv: true }] } as Response);
    await expect(listMcpServers(fetcher, "/mcp/servers")).resolves.toEqual([{ id: "1", name: "notas", hasEnv: true }]);
  });
});
