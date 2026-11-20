import { describe, expect, it } from "vitest";
import { shutdownAvailability, shutdownConfirmationText, shutdownResultMessage, stoppedServicesGuidance } from "./shutdown-plan";

describe("plano de encerramento dos serviços locais", () => {
  it("explica o que será encerrado e que os dados serão preservados", () => {
    const text = shutdownConfirmationText();
    expect(text).toContain("serviços locais iniciados pelo aplicativo");
    expect(text).toContain("PostgreSQL será parado por último");
    expect(text).toContain("Os dados não serão apagados");
  });

  it("habilita somente quando backend e dependências necessárias estão disponíveis", () => {
    const healthy = { status: "ok", dependencies: { postgres: "connected", redis: "unavailable", queue: { driver: "process-memory" } } };
    expect(shutdownAvailability(healthy, false).enabled).toBe(true);
    expect(shutdownAvailability(null, false, true).enabled).toBe(true);
    expect(shutdownAvailability(null, false, false).enabled).toBe(false);
    expect(shutdownAvailability({ ...healthy, status: "down" }, false).enabled).toBe(false);
    expect(shutdownAvailability({ ...healthy, dependencies: { ...healthy.dependencies, postgres: "unavailable" } }, false).reason).toContain("PostgreSQL");
    expect(shutdownAvailability({ ...healthy, dependencies: { ...healthy.dependencies, queue: { driver: "redis" } } }, false).reason).toContain("Redis");
    expect(shutdownAvailability(healthy, true).enabled).toBe(false);
  });

  it("explica a indisponibilidade esperada depois do encerramento", () => {
    expect(stoppedServicesGuidance(true)).toContain("foram encerrados");
    expect(stoppedServicesGuidance(false)).toBeNull();
  });

  it("mostra a saída de sucesso e os detalhes de falha do script", () => {
    expect(shutdownResultMessage({ exitCode: 0, stdout: "Serviços encerrados.", stderr: "" })).toBe("Serviços encerrados.");
    expect(shutdownResultMessage({ exitCode: 1, stdout: "", stderr: "Falha ao parar o PostgreSQL." })).toContain("Falha ao parar o PostgreSQL.");
  });
});
