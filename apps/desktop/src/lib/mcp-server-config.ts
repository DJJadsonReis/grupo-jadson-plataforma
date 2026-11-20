export function buildMcpClientConfig(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  const endpoint = normalized.endsWith("/api/v1") ? `${normalized}/mcp-server` : `${normalized}/api/v1/mcp-server`;
  return JSON.stringify({ type: "http", url: endpoint, headers: { Authorization: "Bearer <SEU_TOKEN>" } }, null, 2);
}

export function mcpTokenStatus(revokedAt: string | null): "Ativo" | "Revogado" { return revokedAt ? "Revogado" : "Ativo"; }
export function mcpTokenLastUsed(lastUsedAt: string | null, locale = "pt-BR"): string {
  return lastUsedAt ? new Date(lastUsedAt).toLocaleString(locale) : "Nunca usado";
}
