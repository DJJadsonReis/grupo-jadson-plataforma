export const MAX_PREFERENCE_INSTRUCTIONS = 3000;

export type ResponseStyle = "concise" | "balanced" | "detailed";

export interface UserPreferences {
  instructions: string;
  responseStyle: ResponseStyle;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  instructions: "",
  responseStyle: "balanced",
};

export function isResponseStyle(value: unknown): value is ResponseStyle {
  return value === "concise" || value === "balanced" || value === "detailed";
}

export function isValidInstructions(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PREFERENCE_INSTRUCTIONS;
}

export function buildPreferencesPayload(instructions: string, responseStyle: ResponseStyle): UserPreferences {
  if (!isValidInstructions(instructions)) throw new Error("Instruções devem ter até 3000 caracteres.");
  if (!isResponseStyle(responseStyle)) throw new Error("Estilo de resposta inválido.");
  return { instructions, responseStyle };
}

export function parsePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
  const candidate = value as Record<string, unknown>;
  return {
    instructions: isValidInstructions(candidate.instructions) ? candidate.instructions : "",
    responseStyle: isResponseStyle(candidate.responseStyle) ? candidate.responseStyle : "balanced",
  };
}

export async function loadPreferences(apiFetch: (input: string, init?: RequestInit) => Promise<Response>, apiUrl: string, signal?: AbortSignal): Promise<UserPreferences> {
  const response = await apiFetch(`${apiUrl}/user-preferences`, signal ? { signal } : {});
  if (!response.ok) throw new Error("Não foi possível carregar as preferências.");
  return parsePreferences(await response.json());
}

export async function savePreferences(apiFetch: (input: string, init?: RequestInit) => Promise<Response>, apiUrl: string, instructions: string, responseStyle: ResponseStyle): Promise<UserPreferences> {
  const body = buildPreferencesPayload(instructions, responseStyle);
  const response = await apiFetch(`${apiUrl}/user-preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Não foi possível salvar as preferências.");
  return parsePreferences(await response.json().catch(() => body));
}
