import type { CSSProperties } from "react";
import type { RichComponent as RichComponentData } from "../lib/rich-components";

export function RichComponent({ component }: { component: RichComponentData }) {
  if (component.tipo === "cartao") return <section className="gx-rich-card"><strong>{component.titulo}</strong><p>{component.corpo}</p></section>;
  if (component.tipo === "tabela") return <div className="gx-rich-table-wrap"><table className="gx-rich-table"><thead><tr>{component.colunas.map((coluna, i) => <th key={i}>{coluna}</th>)}</tr></thead><tbody>{component.linhas.map((linha, i) => <tr key={i}>{linha.map((celula, j) => <td key={j}>{celula}</td>)}</tr>)}</tbody></table></div>;
  const max = Math.max(...component.itens.map((item) => item.valor), 0);
  return <section className="gx-rich-bars">{component.titulo && <strong>{component.titulo}</strong>}{component.itens.map((item, i) => <div className="gx-rich-bar-row" key={i}><span>{item.rotulo}</span><div className="gx-rich-bar-track"><div className="gx-rich-bar" style={{ width: `${max === 0 ? 0 : item.valor / max * 100}%` } as CSSProperties} /></div><span>{item.valor}</span></div>)}</section>;
}
