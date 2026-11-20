import { describe, expect, it } from "vitest";
import { acoesDaTarefa, botsDisponiveis, resumoResultado, rotuloEstadoTarefa } from "./task-queue";

describe("task queue helpers", () => {
  it("labels known and unknown states", () => {
    expect(rotuloEstadoTarefa("na_fila")).toBe("Na fila");
    expect(rotuloEstadoTarefa("em_andamento")).toBe("Em andamento");
    expect(rotuloEstadoTarefa("falhou")).toBe("Falhou");
    expect(rotuloEstadoTarefa("misterioso")).toBe("Aberta");
  });
  it("returns allowed actions for each state", () => {
    expect(acoesDaTarefa("aberta")).toEqual(["enviar"]);
    expect(acoesDaTarefa("na_fila")).toEqual(["cancelar"]);
    expect(acoesDaTarefa("falhou")).toEqual(["tentar_de_novo", "enviar"]);
    expect(acoesDaTarefa("em_andamento")).toEqual([]);
    expect(acoesDaTarefa("concluida")).toEqual([]);
    expect(acoesDaTarefa("arquivada")).toEqual([]);
  });
  it("filters disabled bots and truncates result previews", () => {
    expect(botsDisponiveis([{ id: "a", enabled: true }, { id: "b", enabled: false }])).toEqual([{ id: "a", enabled: true }]);
    expect(resumoResultado("curto")).toBe("curto");
    expect(resumoResultado("x".repeat(281))).toBe(`${"x".repeat(280)}…`);
  });
});
