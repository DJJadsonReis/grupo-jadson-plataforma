export type HealthResponse = {
  status?: unknown;
  dependencies?: {
    postgres?: unknown;
    pgvector?: unknown;
    redis?: unknown;
    queue?: { driver?: unknown; persistence?: unknown } | null;
  } | null;
  timestamp?: unknown;
};

export type StatusRow = { label: string; state: "ok" | "indisponível" | "desconhecido"; guidance: string };

function dependencyState(value: unknown): StatusRow["state"] {
  return value === "connected" ? "ok" : value === "unavailable" ? "indisponível" : "desconhecido";
}

export function toStatusRows(health: HealthResponse | null): StatusRow[] {
  if (!health) return [
    { label: "Backend", state: "indisponível", guidance: "Inicie o backend pelo assistente de primeira execução e verifique novamente." },
    { label: "PostgreSQL", state: "desconhecido", guidance: "O estado será informado quando o backend responder." },
    { label: "pgvector", state: "desconhecido", guidance: "O estado será informado quando o backend responder." },
    { label: "Redis", state: "desconhecido", guidance: "O estado será informado quando o backend responder." },
    { label: "Fila", state: "desconhecido", guidance: "O estado será informado quando o backend responder." },
  ];

  const dependencies = health.dependencies;
  const queue = dependencies?.queue;
  const redisUnused = queue?.driver === "process-memory";
  const backendState = health.status === "ok" ? "ok" : "desconhecido";
  return [
    { label: "Backend", state: backendState, guidance: backendState === "ok" ? "Backend respondeu à verificação." : "O backend respondeu com um estado desconhecido." },
    { label: "PostgreSQL", state: dependencyState(dependencies?.postgres), guidance: dependencies?.postgres === "unavailable" ? "Verifique a conexão PostgreSQL configurada para o backend." : "" },
    { label: "pgvector", state: dependencyState(dependencies?.pgvector), guidance: dependencies?.pgvector === "unavailable" ? "Verifique se a extensão pgvector está disponível no PostgreSQL." : "" },
    { label: "Redis", state: redisUnused ? "desconhecido" : dependencyState(dependencies?.redis), guidance: redisUnused ? "Não usado nesta configuração." : dependencies?.redis === "unavailable" ? "Verifique a conexão Redis configurada para o backend." : "" },
    { label: "Fila", state: queue ? "ok" : "desconhecido", guidance: queue ? `Driver: ${String(queue.driver ?? "desconhecido")}; persistência: ${String(queue.persistence ?? "desconhecida")}.` : "Configuração da fila indisponível." },
  ];
}
