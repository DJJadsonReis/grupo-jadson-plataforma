import { describe, expect, it } from "vitest";
import { canEditAgent, canShareAgent, visibleAgentIds } from "./agent-access";

describe("bot sharing controls", () => {
  it("lets owners and editors edit, but only owners share", () => {
    expect(canEditAgent({ permission: "owner" })).toBe(true);
    expect(canEditAgent({ permission: "editor" })).toBe(true);
    expect(canEditAgent({ permission: "user" })).toBe(false);
    expect(canShareAgent({ permission: "owner" })).toBe(true);
    expect(canShareAgent({ permission: "editor" })).toBe(false);
  });

  it("keeps local profiles editable and limits remote cards to accessible ids", () => {
    expect(canEditAgent({})).toBe(true);
    expect(visibleAgentIds([{ id: "visible" }, { id: "hidden" }], ["visible"])).toEqual([{ id: "visible" }]);
  });
});
