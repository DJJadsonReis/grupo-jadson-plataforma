import { describe, expect, it } from "vitest";
import { AUDIT_LABELS, auditActionLabel } from "./audit-labels";

describe("rótulos de auditoria", () => {
  it("mapeia todas as ações de sala de equipe para pt-BR", () => {
    const actions = ["team.room.created", "team.room.member_added", "team.room.member_removed"];
    for (const action of actions) expect(AUDIT_LABELS[action]).toBeTruthy();
    expect(auditActionLabel("team.room.created")).toBe("Sala de equipe criada");
    expect(auditActionLabel("team.room.member_added")).toBe("Pessoa adicionada à sala");
    expect(auditActionLabel("team.room.member_removed")).toBe("Pessoa removida da sala");
  });

  it("preserva a ação original quando ainda não existe rótulo", () => {
    expect(auditActionLabel("acao.futura")).toBe("acao.futura");
  });
});
