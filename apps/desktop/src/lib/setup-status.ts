export type SetupRepairResult = { databaseUrlMissing: boolean };
export type SetupNotice = {
  kind: "ok" | "precisa_url" | "erro";
  message: string;
  action: "none" | "repair" | "settings";
};

export function setupNotice(result: SetupRepairResult | null, failed = false): SetupNotice {
  if (failed) return { kind: "erro", message: "Não foi possível preparar a conexão local. Tente reparar ou confira as configurações.", action: "repair" };
  if (result?.databaseUrlMissing) return { kind: "precisa_url", message: "Falta o endereço do PostgreSQL. Configure-o para conectar o backend.", action: "settings" };
  return { kind: "ok", message: "Conexão local preparada.", action: "none" };
}
