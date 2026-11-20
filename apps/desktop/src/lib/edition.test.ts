import { describe, expect, it } from "vitest";
import { canShowSharing, needsSignIn, parseEditionResponse, startupScreen } from "./edition";

describe("edition helpers", () => {
  it.each([[{ edition: "equipe" }, "equipe"], [{ edition: "pessoal" }, "pessoal"], [{ edition: "invalid" }, "equipe"], [null, "equipe"], ["pessoal", "equipe"]] as const)("parses %j as %s", (body, expected) => {
    expect(parseEditionResponse(body)).toBe(expected);
  });

  it("does not require sign-in in personal edition", () => {
    expect(needsSignIn("pessoal", 2, false)).toBe(false);
  });

  it("requires sign-in in team edition when providers are configured and no session exists", () => {
    expect(needsSignIn("equipe", 2, false)).toBe(true);
    expect(needsSignIn("equipe", 2, true)).toBe(false);
    expect(needsSignIn("equipe", 0, false)).toBe(false);
  });

  it("hides bot sharing in personal edition", () => {
    expect(canShowSharing("pessoal")).toBe(false);
    expect(canShowSharing("equipe")).toBe(true);
  });

  it("keeps first run ahead of edition loading", () => {
    expect(startupScreen({ firstRunComplete: false, editionLoaded: false, needsLogin: false, edition: "equipe", hasSession: false })).toBe("welcome");
  });

  it("shows a neutral loading screen while edition is pending", () => {
    expect(startupScreen({ firstRunComplete: true, editionLoaded: false, needsLogin: false, edition: "equipe", hasSession: false })).toBe("loading");
  });

  it("shows login only for team edition when required", () => {
    expect(startupScreen({ firstRunComplete: true, editionLoaded: true, needsLogin: true, edition: "equipe", hasSession: false })).toBe("login");
    expect(startupScreen({ firstRunComplete: true, editionLoaded: true, needsLogin: true, edition: "pessoal", hasSession: false })).toBe("workspace");
  });
});
