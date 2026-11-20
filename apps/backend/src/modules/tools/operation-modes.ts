export const OPERATION_MODES = ["automatico", "manual", "aceitar_edicoes", "planejamento", "ignorar_permissoes"] as const;
export type OperationMode = (typeof OPERATION_MODES)[number];

export type ToolCategory = "leitura" | "escrita_arquivo" | "escrita_documento" | "escrita_memoria" | "rede" | "codigo" | "envio" | "sensivel";
export type ToolDecision = "run" | "approve" | "block";

const EXECUTION_POLICY: Record<OperationMode, Record<ToolCategory, ToolDecision>> = {
  automatico: { leitura: "run", escrita_arquivo: "run", escrita_documento: "run", escrita_memoria: "run", rede: "run", codigo: "run", envio: "approve", sensivel: "approve" },
  manual: { leitura: "run", escrita_arquivo: "approve", escrita_documento: "approve", escrita_memoria: "approve", rede: "approve", codigo: "approve", envio: "approve", sensivel: "approve" },
  aceitar_edicoes: { leitura: "run", escrita_arquivo: "run", escrita_documento: "run", escrita_memoria: "run", rede: "approve", codigo: "approve", envio: "approve", sensivel: "approve" },
  planejamento: { leitura: "run", escrita_arquivo: "block", escrita_documento: "block", escrita_memoria: "block", rede: "block", codigo: "block", envio: "block", sensivel: "block" },
  ignorar_permissoes: { leitura: "run", escrita_arquivo: "run", escrita_documento: "run", escrita_memoria: "run", rede: "run", codigo: "run", envio: "run", sensivel: "run" },
};

export function decisionForOperationMode(mode: OperationMode, category: ToolCategory, policy: "allow" | "ask" | "deny" | null = null): ToolDecision {
  if (policy === "deny") return "block";
  const modeDecision = EXECUTION_POLICY[mode][category];
  if (modeDecision === "block") return "block";
  if (modeDecision === "approve") return policy === "allow" && mode !== "ignorar_permissoes" ? "run" : "approve";
  if (policy === "ask") return "approve";
  return "run";
}

export function isOperationMode(value: unknown): value is OperationMode {
  return typeof value === "string" && (OPERATION_MODES as readonly string[]).includes(value);
}
