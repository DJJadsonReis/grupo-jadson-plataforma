import { describe, expect, it } from "vitest";
import { evaluateWindowsBuild } from "./windows-requirements";

describe("evaluateWindowsBuild", () => {
  it("bloqueia build abaixo do mínimo", () => expect(evaluateWindowsBuild(17762).status).toBe("bloqueado"));
  it("aceita o build mínimo", () => expect(evaluateWindowsBuild(17763).status).toBe("ok"));
  it("aceita string numérica", () => expect(evaluateWindowsBuild("26200").status).toBe("ok"));
  it.each(["abc", null, undefined, ""])("trata %s como indisponível", (raw) => {
    expect(evaluateWindowsBuild(raw).status).toBe("indisponivel");
  });
});
