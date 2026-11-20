export type ChartSeries = { nome: string; valores: number[] };
export type Point = { x: number; y: number; rotulo: string; serie: string; valor: number };
export type PieSlice = { startAngle: number; endAngle: number; rotulo: string; serie: string; valor: number };

export function getVisibleSeries<T extends { nome: string }>(series: T[], visible: Set<number>): T[] {
  return series.filter((_, index) => visible.has(index));
}

export function getVisibleSeriesAfterToggle(seriesCount: number, visible: Set<number>, index: number): Set<number> {
  const next = new Set(visible);
  if (next.has(index)) {
    if (next.size > 1) next.delete(index);
  } else if (index >= 0 && index < seriesCount) next.add(index);
  return next;
}

export function getValueScale(series: ChartSeries[]): { max: number; ticks: number[] } {
  const maxValue = Math.max(0, ...series.flatMap((item) => item.valores));
  const max = maxValue === 0 ? 1 : Math.ceil(maxValue / 4) * 4;
  return { max, ticks: [0, 1, 2, 3, 4].map((tick) => max * tick / 4) };
}

export function getLinePoints(labels: string[], series: ChartSeries[], max: number, width = 640, height = 300): Point[][] {
  const left = 48; const right = 16; const top = 18; const bottom = 48;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  return series.map((item) => item.valores.map((valor, index) => ({
    x: left + (labels.length === 1 ? plotWidth / 2 : index * plotWidth / (labels.length - 1)),
    y: top + plotHeight - valor / max * plotHeight,
    rotulo: labels[index] ?? "", serie: item.nome, valor,
  })));
}

export function getPieSlices(labels: string[], series: ChartSeries): PieSlice[] {
  const total = series.valores.reduce((sum, value) => sum + value, 0);
  let angle = 0;
  return series.valores.flatMap((valor, index) => {
    if (valor === 0 || total <= 0) return [];
    const startAngle = angle;
    angle += valor / total * 360;
    return [{ startAngle, endAngle: angle, rotulo: labels[index] ?? "", serie: series.nome, valor }];
  });
}

export function describeChartTip(point: Pick<Point, "rotulo" | "serie" | "valor">): string {
  return `${point.rotulo} · ${point.serie}: ${point.valor}`;
}

export function describePieTip(slice: PieSlice): string {
  return `${slice.rotulo} · ${slice.serie}: ${slice.valor}`;
}

export function describeChartSummary(labels: string[], series: ChartSeries[]): string {
  return series.map((item) => `${item.nome}: ${item.valores.map((value, index) => `${labels[index] ?? ""} ${value}`).join(", ")}`).join(". ");
}

export function pieSlicePath(slice: PieSlice, cx = 180, cy = 150, radius = 110): string {
  const point = (angle: number) => {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
  };
  const start = point(slice.startAngle); const end = point(slice.endAngle);
  const fullCircle = slice.endAngle - slice.startAngle >= 359.999;
  if (fullCircle) {
    const middle = point(slice.startAngle + 180);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${middle.x} ${middle.y} A ${radius} ${radius} 0 1 1 ${start.x} ${start.y} Z`;
  }
  const largeArc = slice.endAngle - slice.startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}
