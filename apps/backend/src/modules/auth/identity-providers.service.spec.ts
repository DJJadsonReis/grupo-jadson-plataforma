import { identityProviderStatus } from "./identity-providers.service";
import { redirectUriFor } from "./oidc.service";

describe("identityProviderStatus", () => {
  it("lists known providers and missing variable names without returning credentials", () => {
    const result = identityProviderStatus({
      GOOGLE_CLIENT_ID: "id-falso",
      GOOGLE_CLIENT_SECRET: "segredo-de-teste-123",
      OKTA_CLIENT_ID: "okta-id-falso",
      OKTA_CLIENT_SECRET: "okta-segredo-falso",
    });
    expect(result.map(({ id }) => id)).toEqual(["google", "microsoft", "okta"]);
    expect(result[0]).toMatchObject({ configured: true, missingVars: [] });
    expect(result[1]?.missingVars).toEqual(["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]);
    expect(result[2]?.missingVars).toContain("OKTA_ISSUER");
    expect(JSON.stringify(result)).not.toContain("segredo-de-teste-123");
    expect(JSON.stringify(result)).not.toContain("id-falso");
  });

  it("reports a missing secret and builds callback URIs with and without a base override", () => {
    expect(identityProviderStatus({ GOOGLE_CLIENT_ID: "id-falso" })[0]).toMatchObject({
      configured: false,
      missingVars: ["GOOGLE_CLIENT_SECRET"],
      redirectUri: "http://127.0.0.1:3333/api/v1/auth/callback/google",
    });
    expect(redirectUriFor("google", { OIDC_REDIRECT_BASE: "https://login.example.test/" }))
      .toBe("https://login.example.test/api/v1/auth/callback/google");
  });
});
