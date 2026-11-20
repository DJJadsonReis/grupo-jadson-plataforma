import type { HealthResponse } from "../components/status/status-rows";

export type ShutdownResult = { exitCode: number; stdout: string; stderr: string };

export function shutdownConfirmationText(): string {
  return "Serão encerrados os serviços locais iniciados pelo aplicativo e registrados em .runtime/processes.json. O PostgreSQL será parado por último. Os dados não serão apagados. Deseja continuar?";
}

export function shutdownAvailability(health: HealthResponse | null, stopping: boolean, initialCheckPending = false): { enabled: boolean; reason: string } {
  if (stopping) return { enabled: false, reason: "O encerramento já está em andamento." };
  if (!health && initialCheckPending) return { enabled: true, reason: "" };
  if (health?.status !== "ok") return { enabled: false, reason: "O backend precisa estar disponível para encerrar os serviços locais." };
  if (health.dependencies?.postgres !== "connected") return { enabled: false, reason: "O PostgreSQL precisa estar conectado para encerrar os serviços locais." };
  const usesRedis = health.dependencies?.queue?.driver === "redis";
  if (usesRedis && health.dependencies?.redis !== "connected") return { enabled: false, reason: "O Redis precisa estar conectado para encerrar os serviços locais." };
  return { enabled: true, reason: "" };
}

export function stoppedServicesGuidance(stoppedByApp: boolean): string | null {
  return stoppedByApp ? "Os serviços locais foram encerrados pelo aplicativo. Para usá-los novamente, inicie-os pelo assistente de primeira execução." : null;
}

export function shutdownResultMessage(result: ShutdownResult): string {
  if (result.exitCode === 0) {
    if (result.stdout.includes("Nenhum serviço local registrado para encerrar.")) {
      return "Nenhum serviço local registrado para encerrar.";
    }
    return result.stdout.trim() || "Encerramento dos serviços locais concluído.";
  }
  const detail = result.stderr.trim() || result.stdout.trim();
  return detail
    ? `Não foi possível encerrar todos os serviços locais. ${detail}`
    : `Não foi possível encerrar todos os serviços locais (código ${result.exitCode}).`;
}
