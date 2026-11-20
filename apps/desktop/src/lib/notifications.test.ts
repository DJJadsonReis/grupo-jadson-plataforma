import { describe, expect, it } from "vitest";
import { formatNotificationDate, notificationKindLabel } from "./notifications";

describe("notificationKindLabel", () => {
  it.each([
    ["approval.pending", "Aprovação pendente"],
    ["routine.failed", "Rotina falhou"],
    ["tool_limit.reached", "Limite de ferramentas atingido"],
    ["responsibility.result", "Resultado de responsabilidade"],
    ["responsibility.disabled", "Responsabilidade desativada"],
    ["human_support.requested", "Atendimento humano solicitado"],
  ])("traduz %s", (kind, label) => expect(notificationKindLabel(kind)).toBe(label));
  it("usa rótulo genérico para tipo desconhecido", () => expect(notificationKindLabel("outro")).toBe("Notificação"));
});

describe("formatNotificationDate", () => {
  it("formata data e hora em pt-BR", () => {
    const result = formatNotificationDate("2026-01-02T15:04:00.000Z");
    expect(result).toContain("02/01/2026");
    expect(result).toContain("12:04");
  });
  it("devolve mensagem para data inválida", () => expect(formatNotificationDate("inválida")).toBe("data desconhecida"));
});
