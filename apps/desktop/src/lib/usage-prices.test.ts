import { describe, expect, it } from "vitest";
import { formatModelPriceUsd, parsePriceField } from "./usage-prices";

describe("model price helpers", () => {
  it.each(["", "   "])("rejects an empty field", (value) => expect(parsePriceField(value)).toEqual({ error: "Informe um preço." }));
  it("rejects negative and nonnumeric values", () => {
    expect(parsePriceField("-1")).toHaveProperty("error");
    expect(parsePriceField("texto")).toHaveProperty("error");
  });
  it("accepts comma decimals", () => expect(parsePriceField("2,75")).toEqual({ value: 2.75 }));
  it("formats values as US dollars for a Brazilian locale", () => expect(formatModelPriceUsd(2.5)).toBe("US$ 2,50"));
});
