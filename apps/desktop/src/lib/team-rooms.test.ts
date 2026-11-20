import { describe, expect, it } from "vitest";
import { findMentionedBotNames, validateMessageText, validateRoomName } from "./team-rooms";

describe("team rooms validation and mentions", () => {
  it("validates room names and message sizes", () => {
    expect(validateRoomName("  ")).not.toBeNull();
    expect(validateRoomName("a".repeat(80))).toBeNull();
    expect(validateRoomName("a".repeat(81))).not.toBeNull();
    expect(validateMessageText(" ")).not.toBeNull();
    expect(validateMessageText("x".repeat(4000))).toBeNull();
    expect(validateMessageText("x".repeat(4001))).not.toBeNull();
  });
  it("matches case-insensitively, once, and at a word boundary", () => {
    expect(findMentionedBotNames("@ANA e @ana", ["Ana", "Ana", "Anabela"])).toEqual(["Ana"]);
    expect(findMentionedBotNames("@Anabela", ["Ana", "Anabela"])).toEqual(["Anabela"]);
  });
});
