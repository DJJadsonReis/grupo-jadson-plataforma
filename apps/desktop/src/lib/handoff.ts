import type { Agent } from "./workspace";

export function agentesDelegaveis(agentes: Agent[], agentIdAtual: string | null | undefined): Agent[] {
  return agentes.filter((agent) => agent.enabled && agent.id !== agentIdAtual);
}

export function rotuloDelegacao(from: string, to: string, motivo?: string | null): string {
  return `Conversa passada de ${from || "Assistente Geral"} para ${to}${motivo?.trim() ? ` — ${motivo.trim()}` : ""}`;
}

export function delegacaoDesabilitada(destino: string, delegando: boolean): boolean {
  return !destino || delegando;
}
