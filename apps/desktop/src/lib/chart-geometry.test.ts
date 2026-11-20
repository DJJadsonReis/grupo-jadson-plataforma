import { describe, expect, it } from "vitest";
import { describeChartTip, getLinePoints, getPieSlices, getValueScale, getVisibleSeriesAfterToggle, pieSlicePath } from "./chart-geometry";

describe("geometria de gráficos", () => {
  it("calcula duas linhas e tooltip de um ponto conhecido", () => {
    const series = [{ nome: "Real", valores: [2, 8] }, { nome: "Meta", valores: [4, 10] }];
    const points = getLinePoints(["A", "B"], series, 12);
    expect(points).toHaveLength(2);
    expect(points.map((line) => line.length)).toEqual([2, 2]);
    expect(points[0]).toHaveLength(2);
    expect(describeChartTip(points[0]![1]!)).toBe("B · Real: 8");
  });
  it("recalcula escala para as séries visíveis e mantém uma ligada", () => {
    const next = getVisibleSeriesAfterToggle(2, new Set([0, 1]), 1);
    expect(next).toEqual(new Set([0]));
    expect(getValueScale([{ nome: "Real", valores: [2, 8] }]).max).toBe(8);
    expect(getVisibleSeriesAfterToggle(2, next, 0)).toEqual(next);
  });
  it("omite fatias zeradas e fecha os ângulos em 360 graus", () => {
    const slices = getPieSlices(["A", "Zero", "B"], { nome: "Partes", valores: [2, 0, 2] });
    expect(slices).toHaveLength(2);
    expect(slices[0]!.startAngle).toBe(0);
    expect(slices.reduce((sum, slice) => sum + slice.endAngle - slice.startAngle, 0)).toBe(360);
    expect(slices.at(-1)!.endAngle).toBe(360);
    expect(pieSlicePath(slices[0]!)).toContain("A ");
  });
});
