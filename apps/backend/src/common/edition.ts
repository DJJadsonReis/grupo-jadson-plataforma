export type Edition = "equipe" | "pessoal";

export function parseEdition(value: string | undefined): Edition {
  if (value === undefined || value === "equipe") return "equipe";
  if (value === "pessoal") return "pessoal";
  throw new Error(`Valor inválido para GRUPO_EDICAO: "${value}". Use "equipe" ou "pessoal".`);
}

export function assertPersonalHost(edition: Edition, host: string): void {
  if (edition === "pessoal" && !["127.0.0.1", "::1", "localhost"].includes(host.toLowerCase())) {
    throw new Error("O modo pessoal só aceita conexões locais. Configure API_HOST como 127.0.0.1, ::1 ou localhost.");
  }
}

export function isPersonalEdition(): boolean {
  return parseEdition(process.env.GRUPO_EDICAO) === "pessoal";
}
