import { ProviderId, providersFromEnv, redirectUriFor } from "./oidc.service";

const KNOWN_PROVIDERS: { id: ProviderId; label: string; prefix: string }[] = [
  { id: "google", label: "Google", prefix: "GOOGLE" },
  { id: "microsoft", label: "Microsoft", prefix: "MICROSOFT" },
  { id: "okta", label: "Okta", prefix: "OKTA" },
];

export type IdentityProviderStatus = {
  id: ProviderId;
  label: string;
  configured: boolean;
  missingVars: string[];
  redirectUri: string;
  issuer?: string;
};

/** Status público para a tela administrativa; nunca inclui identificador ou segredo do cliente. */
export function identityProviderStatus(env: NodeJS.ProcessEnv = process.env): IdentityProviderStatus[] {
  const configured = new Map(providersFromEnv(env).map((provider) => [provider.id, provider]));
  return KNOWN_PROVIDERS.map(({ id, label, prefix }) => {
    const missingVars = [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`]
      .filter((name) => !env[name]?.trim());
    if (id === "okta" && !env.OKTA_ISSUER?.trim()) missingVars.push("OKTA_ISSUER");
    const provider = configured.get(id);
    return {
      id,
      label,
      configured: missingVars.length === 0,
      missingVars,
      redirectUri: redirectUriFor(id, env),
      ...(id === "okta" && provider ? { issuer: provider.issuer } : {}),
    };
  });
}
