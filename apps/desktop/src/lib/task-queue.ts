import type { QueueTaskStatus } from "./tasks";

export type TaskAction = "enviar" | "cancelar" | "tentar_de_novo";
export function rotuloEstadoTarefa(status: string): string {
  switch (status) {
    case "na_fila": return "Na fila";
    case "em_andamento": return "Em andamento";
    case "concluida": return "Concluída";
    case "falhou": return "Falhou";
    case "arquivada": return "Arquivada";
    case "aberta": return "Aberta";
    default: return "Aberta";
  }
}
export function acoesDaTarefa(status: string): TaskAction[] {
  if (status === "aberta") return ["enviar"];
  if (status === "na_fila") return ["cancelar"];
  if (status === "falhou") return ["tentar_de_novo", "enviar"];
  return [];
}
export function botsDisponiveis<T extends { enabled: boolean }>(agents: T[]): T[] { return agents.filter((agent) => agent.enabled); }
export function resumoResultado(texto: string): string { return texto.length <= 280 ? texto : `${texto.slice(0, 280)}…`; }
export type QueueTaskStatusValue = QueueTaskStatus;
