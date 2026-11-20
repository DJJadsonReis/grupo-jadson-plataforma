import { describe, expect, it } from "vitest";
import { setupNotice } from "./setup-status";

describe("aviso da configuração local", () => {
  it("orienta informar o endereço PostgreSQL quando ele falta", () => {
    expect(setupNotice({ databaseUrlMissing: true })).toEqual({
      kind: "precisa_url",
      message: "Falta o endereço do PostgreSQL. Configure-o para conectar o backend.",
      action: "settings",
    });
  });
  it("mostra reparo quando houve erro e não expõe a causa técnica", () => {
    const notice = setupNotice(null, true);
    expect(notice.kind).toBe("erro");
    expect(notice.action).toBe("repair");
    expect(notice.message).not.toMatch(/token|postgres:\/\/|http|error/i);
  });
  it("não mostra aviso quando o setup está completo", () => {
    expect(setupNotice({ databaseUrlMissing: false }).action).toBe("none");
  });
});
