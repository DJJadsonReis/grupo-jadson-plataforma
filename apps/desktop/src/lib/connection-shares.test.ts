import { describe, expect, it } from "vitest";
import { canRevokeShare, shareStatusLabel, validateShareTarget } from "./connection-shares";
const people = [{ id: "a", name: "Ana" }, { id: "b", name: "Bruno" }];
describe("connection shares", () => {
  it("validates empty, self, unknown and valid targets", () => {
    expect(validateShareTarget("a", "", people)).toBeTruthy();
    expect(validateShareTarget("a", "a", people)).toBeTruthy();
    expect(validateShareTarget("a", "x", people)).toBeTruthy();
    expect(validateShareTarget("a", "b", people)).toBeNull();
  });
  it("labels pending and approved shares", () => {
    expect(shareStatusLabel("pending")).toBe("Aguardando aprovação do admin");
    expect(shareStatusLabel("approved")).toBe("Ativo");
  });
  it("allows owners and admins to revoke", () => {
    const share = { ownerId: "a", granteeId: "b", status: "approved" };
    expect(canRevokeShare("a", false, share)).toBe(true);
    expect(canRevokeShare("b", false, share)).toBe(false);
    expect(canRevokeShare("c", false, share)).toBe(false);
    expect(canRevokeShare("c", true, share)).toBe(true);
  });
});
