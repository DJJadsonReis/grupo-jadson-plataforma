import type { CSSProperties } from "react";
import type { RichComponent as RichComponentData } from "../lib/rich-components";
import { describeChartSummary, describeChartTip, describePieTip, getLinePoints, getPieSlices, getValueScale, getVisibleSeries, getVisibleSeriesAfterToggle, pieSlicePath } from "../lib/chart-geometry";
import { useState } from "react";

export function RichComponent({ component }: { component: RichComponentData }) {
  if (component.tipo === "cartao") return <section className="gx-rich-card"><strong>{component.titulo}</strong><p>{component.corpo}</p></section>;
  if (component.tipo === "tabela") return <div className="gx-rich-table-wrap"><table className="gx-rich-table"><thead><tr>{component.colunas.map((coluna, i) => <th key={i}>{coluna}</th>)}</tr></thead><tbody>{component.linhas.map((linha, i) => <tr key={i}>{linha.map((celula, j) => <td key={j}>{celula}</td>)}</tr>)}</tbody></table></div>;
  if (component.tipo === "grafico") return <RichChart component={component} />;
  const max = Math.max(...component.itens.map((item) => item.valor), 0);
  return <section className="gx-rich-bars">{component.titulo && <strong>{component.titulo}</strong>}{component.itens.map((item, i) => <div className="gx-rich-bar-row" key={i}><span>{item.rotulo}</span><div className="gx-rich-bar-track"><div className="gx-rich-bar" style={{ width: `${max === 0 ? 0 : item.valor / max * 100}%` } as CSSProperties} /></div><span>{item.valor}</span></div>)}</section>;
}

const chartColors = ["var(--gj-gold)", "var(--gj-gold-bright)", "var(--gj-success)", "var(--gj-danger)", "var(--gj-text-secondary)", "var(--gj-border-strong)"];

function RichChart({ component }: { component: Extract<RichComponentData, { tipo: "grafico" }> }) {
  const [visible, setVisible] = useState(() => new Set(component.series.map((_, index) => index)));
  const [tip, setTip] = useState<string | null>(null);
  const shownSeries = getVisibleSeries(component.series, visible);
  const scale = getValueScale(shownSeries);
  const ariaLabel = `${component.titulo ?? "Gráfico"}, formato ${component.formato}, ${component.series.length} ${component.series.length === 1 ? "série" : "séries"}`;
  const toggle = (index: number) => setVisible((current) => getVisibleSeriesAfterToggle(component.series.length, current, index));

  return <section className="gx-rich-chart">
    {component.titulo && <strong className="gx-rich-chart-title">{component.titulo}</strong>}
    <p className="gx-rich-chart-hint">Passe o mouse para ver o valor</p>
    <div className="gx-rich-chart-visual" role="img" aria-label={ariaLabel}>
      {component.formato === "linha" ? <svg viewBox="0 0 640 300" aria-hidden="true">
        {scale.ticks.map((tick, index) => { const y = 252 - index * 58.5; return <g key={tick}><line className="gx-chart-grid" x1="48" x2="624" y1={y} y2={y} /><text className="gx-chart-axis" x="40" y={y + 4} textAnchor="end">{Math.round(tick)}</text></g>; })}
        {component.rotulos.map((label, index) => { const x = 48 + (component.rotulos.length === 1 ? 288 : index * 576 / (component.rotulos.length - 1)); return <text className="gx-chart-axis" key={`${label}-${index}`} x={x} y="276" textAnchor="middle">{label}</text>; })}
        {getLinePoints(component.rotulos, shownSeries, scale.max).map((points, shownIndex) => {
          const sourceIndex = component.series.indexOf(shownSeries[shownIndex]!);
          const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
          return <g key={shownSeries[shownIndex]!.nome}><polyline className={`gx-chart-line gx-chart-line-${sourceIndex % 6}`} points={polyline} stroke={chartColors[sourceIndex % chartColors.length]} />{points.map((point, pointIndex) => <circle className="gx-chart-point" key={pointIndex} cx={point.x} cy={point.y} r="5" stroke={chartColors[sourceIndex % chartColors.length]} tabIndex={0} aria-label={describeChartTip(point)} onMouseEnter={() => setTip(describeChartTip(point))} onMouseLeave={() => setTip(null)} onFocus={() => setTip(describeChartTip(point))} onBlur={() => setTip(null)} />)}</g>;
        })}
      </svg> : <svg viewBox="0 0 360 300" aria-hidden="true">
        {getPieSlices(component.rotulos, component.series[0]!).map((slice, index) => <path className="gx-chart-slice" key={slice.rotulo} d={pieSlicePath(slice)} fill={chartColors[index % chartColors.length]} tabIndex={0} aria-label={describePieTip(slice)} onMouseEnter={() => setTip(describePieTip(slice))} onMouseLeave={() => setTip(null)} onFocus={() => setTip(describePieTip(slice))} onBlur={() => setTip(null)} />)}
      </svg>}
    </div>
    <p className="gx-rich-chart-tip" aria-live="polite">{tip ?? "\u00a0"}</p>
    <div className="gx-rich-chart-legend" aria-label="Mostrar ou ocultar série">{component.series.map((series, index) => <button type="button" key={series.nome} aria-pressed={visible.has(index)} disabled={visible.has(index) && visible.size === 1} onClick={() => toggle(index)}><i className={index % 2 ? "alternate" : ""} style={{ background: chartColors[index % chartColors.length] }} />{series.nome}</button>)}</div>
    <p className="gx-rich-chart-summary">Resumo para leitor de tela: {describeChartSummary(component.rotulos, component.series)}</p>
  </section>;
}
