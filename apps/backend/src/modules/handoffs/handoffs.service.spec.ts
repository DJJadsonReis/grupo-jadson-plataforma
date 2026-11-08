import { BadRequestException } from "@nestjs/common";
import { MAX_HANDOFF_DEPTH, nextHandoffDepth } from "./handoffs.service";

describe("nextHandoffDepth", () => {
  it("soma uma delegação até o limite", () => {
    expect(nextHandoffDepth(0)).toBe(1);
    expect(nextHandoffDepth(MAX_HANDOFF_DEPTH - 1)).toBe(MAX_HANDOFF_DEPTH);
  });

  it("recusa a delegação que passaria do limite", () => {
    expect(() => nextHandoffDepth(MAX_HANDOFF_DEPTH)).toThrow(BadRequestException);
  });

  it("respeita um limite diferente quando informado", () => {
    expect(() => nextHandoffDepth(1, 1)).toThrow(BadRequestException);
    expect(nextHandoffDepth(0, 1)).toBe(1);
  });
});
