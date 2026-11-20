import { describe, expect, it, vi } from "vitest";
import { canClaimHumanSupport, canResolveHumanSupport, humanSupportStatusLabel } from "./human-support";
import { HumanSupportApi } from "./human-support-api";

describe("human support UI rules", () => {
  it("limits claim and resolve actions to the correct attendant", () => {
    expect(canClaimHumanSupport("aberto", true)).toBe(true);
    expect(canClaimHumanSupport("aberto", false)).toBe(false);
    expect(canResolveHumanSupport("assumido", "a", "b", false)).toBe(false);
    expect(canResolveHumanSupport("assumido", "a", "a", false)).toBe(true);
    expect(canResolveHumanSupport("assumido", "a", "b", true)).toBe(true);
    expect(humanSupportStatusLabel("aberto")).toBe("Aberto");
  });
  it("uses the authenticated fetch client for listing and actions", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]), { status:200 })).mockResolvedValueOnce(new Response("{}", { status:200 }));
    const api = new HumanSupportApi(fetcher, "http://local/api/v1");
    await expect(api.list()).resolves.toEqual([]);
    await api.update("request-1", "claim");
    expect(fetcher).toHaveBeenNthCalledWith(1, "http://local/api/v1/human-support");
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://local/api/v1/human-support/request-1/claim", { method:"POST" });
  });
});
