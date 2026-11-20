import { describe, expect, it } from "vitest";
import { groupIdentityProviders } from "./identity-providers";

describe("groupIdentityProviders", () => {
  it("preserves valid order, drops malformed values, and defaults missingVars", () => {
    expect(groupIdentityProviders([
      { id: "google", label: "Google", configured: true, redirectUri: "http://localhost/callback" },
      null,
      { id: "broken", label: "Broken", configured: "yes" },
      { id: "okta", label: "Okta", configured: false, missingVars: ["OKTA_ISSUER", 3] },
    ])).toEqual([
      { id: "google", label: "Google", configured: true, missingVars: [], redirectUri: "http://localhost/callback" },
      { id: "okta", label: "Okta", configured: false, missingVars: ["OKTA_ISSUER"], redirectUri: "" },
    ]);
  });

  it("returns an empty list for malformed top-level data", () => {
    expect(groupIdentityProviders({ providers: [] })).toEqual([]);
  });
});
