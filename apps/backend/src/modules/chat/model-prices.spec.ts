import { estimateCostUsd } from "./model-prices";

describe("estimateCostUsd", () => {
  it("calculates cost from the supplied price map", () => {
    expect(estimateCostUsd({ "fixture:model": { input: 2, output: 8 } }, "fixture", "model", 1000, 500)).toBe(0.006);
  });

  it("returns null when the model has no registered price", () => {
    expect(estimateCostUsd({}, "fixture", "model", 1000, 500)).toBeNull();
  });
});
