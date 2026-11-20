import type { Agent } from "./workspace";

export type AgentEndpointFields = { providerKind: "model" | "endpoint"; endpointUrl: string; endpointToken: string; endpointProtocol?: "json" | "agui" };

export function protocolosEndpoint(): { value: "json" | "agui"; label: string; dica: string }[] {
  return [
    { value: "json", label: "Simples (JSON)", dica: "Resposta inteira de uma vez." },
    { value: "agui", label: "AG-UI (streaming)", dica: "Resposta aparece enquanto é gerada." },
  ];
}

export function rotuloProtocolo(valor: unknown): string {
  return valor === "agui" ? "AG-UI (streaming)" : "Simples (JSON)";
}

export function validateEndpointUrl(raw: string): string {
  if (raw.length > 500) throw new Error("A URL do endpoint deve ter até 500 caracteres.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new Error("Informe uma URL HTTPS válida, sem credenciais."); }
}

export function agentPayload(agent: Agent, fields: AgentEndpointFields): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...agent, providerKind: fields.providerKind };
  delete payload.hasEndpointToken;
  delete payload.endpointToken;
  if (fields.providerKind === "endpoint") {
    payload.endpointUrl = validateEndpointUrl(fields.endpointUrl);
    payload.endpointProtocol = fields.endpointProtocol ?? agent.endpointProtocol ?? "json";
    if (fields.endpointToken) payload.endpointToken = fields.endpointToken;
  } else {
    delete payload.endpointUrl;
    delete payload.endpointToken;
    delete payload.endpointProtocol;
  }
  return payload;
}

export function endpointReadOptions(): RequestInit {
  return { method: "GET" };
}
