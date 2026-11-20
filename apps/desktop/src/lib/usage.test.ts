import { describe, expect, it } from "vitest";
import { formatCostUsd, formatTokens } from "./usage";

describe("usage formatting", () => {
  it("formats missing, zero, small, and regular costs", () => {
    expect(formatCostUsd(null)).toBe("sem preço cadastrado");
    expect(formatCostUsd(0)).toBe("US$ 0,00");
    expect(formatCostUsd(0.00123)).toBe("US$ 0,0012");
    expect(formatCostUsd(1.25)).toBe("US$ 1,25");
  });

  it("formats token counts in Brazilian Portuguese", () => {
    expect(formatTokens(1234567)).toBe("1.234.567");
  });
});
