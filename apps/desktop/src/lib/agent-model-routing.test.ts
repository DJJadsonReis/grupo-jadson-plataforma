import { describe, expect, it } from "vitest";
import { addFallback, moveFallback, removeFallback, validateFallbacks } from "./agent-model-routing";

describe("agent model routing helpers", () => {
  const items = [{ providerId: "p1", model: "a" }, { providerId: "p2", model: "b" }];
  it("moves and removes ordered fallbacks immutably", () => {
    expect(moveFallback(items, 0, 1)).toEqual([items[1], items[0]]);
    expect(removeFallback(items, 0)).toEqual([items[1]]);
    expect(items).toHaveLength(2);
  });
  it("rejects duplicates and more than five fallbacks", () => {
    expect(() => addFallback(items, items[0]!)).toThrow("já está");
    expect(() => addFallback([...items, ...items, items[0]!], { providerId: "p3", model: "c" })).toThrow("cinco");
    expect(validateFallbacks([items[0]!, items[0]!])).toContain("duplicados");
  });
});
