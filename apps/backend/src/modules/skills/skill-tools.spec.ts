import { effectiveSkillTools } from "./skill-tools";

describe("effectiveSkillTools", () => {
  it("unions skill grants, intersects allowed tools and keeps first occurrence order", () => {
    expect(effectiveSkillTools([
      { tools: ["a", "blocked", "b", "a"] },
      { tools: ["b", "c", "c"] },
    ], new Set(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for an empty allowed set or no skills", () => {
    expect(effectiveSkillTools([{ tools: ["a"] }], new Set())).toEqual([]);
    expect(effectiveSkillTools([], new Set(["a"]))).toEqual([]);
  });
});
