export type IdentityProvider = {
  id: string;
  label: string;
  configured: boolean;
  missingVars: string[];
  redirectUri: string;
  issuer?: string;
};

/** Valida e normaliza os dados de status recebidos do backend. */
export function groupIdentityProviders(data: unknown): IdentityProvider[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): IdentityProvider[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id.trim() || typeof value.label !== "string" ||
      !value.label.trim() || typeof value.configured !== "boolean") return [];
    return [{
      id: value.id,
      label: value.label,
      configured: value.configured,
      missingVars: Array.isArray(value.missingVars) ? value.missingVars.filter((name): name is string => typeof name === "string") : [],
      redirectUri: typeof value.redirectUri === "string" ? value.redirectUri : "",
      ...(typeof value.issuer === "string" ? { issuer: value.issuer } : {}),
    }];
  });
}
