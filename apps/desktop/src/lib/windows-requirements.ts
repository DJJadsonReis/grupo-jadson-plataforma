const MINIMUM_WINDOWS_BUILD = 17763;

export type WindowsBuildEvaluation = {
  status: "ok" | "bloqueado" | "indisponivel";
  build?: number;
  message: string;
};

export function evaluateWindowsBuild(raw: unknown): WindowsBuildEvaluation {
  const build = typeof raw === "number"
    ? raw
    : typeof raw === "string" && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(build) || build < 0) {
    return { status: "indisponivel", message: "Não foi possível verificar a versão do Windows. Você pode continuar." };
  }
  if (build < MINIMUM_WINDOWS_BUILD) {
    return { status: "bloqueado", build, message: `Este aplicativo exige Windows 10 versão 1809 (build ${MINIMUM_WINDOWS_BUILD}) ou superior. Seu Windows tem build ${build}.` };
  }
  return { status: "ok", build, message: "Requisitos do Windows atendidos." };
}
