export type ProviderKeyStatus = "nao_testada" | "valida" | "sem_modelos" | "invalida" | "limite_atingido" | "erro";

export function providerKeyStatus(result: { ok: boolean; models?: readonly unknown[]; httpStatus?: number; message?: string } | null | undefined): ProviderKeyStatus {
  if (!result) return "nao_testada";
  if (result.ok) return result.models?.length ? "valida" : "sem_modelos";
  if (result.httpStatus === 401 || result.httpStatus === 403) return "invalida";
  if (result.httpStatus === 429 || /quota|rate.?limit|limite|cota/i.test(result.message ?? "")) return "limite_atingido";
  return "erro";
}
