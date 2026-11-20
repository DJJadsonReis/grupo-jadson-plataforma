import { describe, expect, it, vi } from "vitest";
import { buildMcpServerPayload, listMcpServers, saveMcpServer } from "./mcp-servers";

describe("buildMcpServerPayload", () => {
  const valid = { name: "notas", command: "node", argsText: "worker.js", env: {}, enabled: true };
  it("rejeita nome inválido", () => { expect(() => buildMcpServerPayload({ ...valid, name: "Inválido" })).toThrow(); });
  it("rejeita comando com espaço", () => { expect(() => buildMcpServerPayload({ ...valid, command: "node --bad" })).toThrow(); });
  it("monta argumentos por linha e omite env vazio", () => { expect(buildMcpServerPayload(valid)).toEqual({ name: "notas", command: "node", args: ["worker.js"], enabled: true }); });
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
