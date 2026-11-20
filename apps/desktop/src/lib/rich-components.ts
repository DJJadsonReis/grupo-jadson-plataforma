export type RichComponent =
  | { tipo: "cartao"; titulo: string; corpo: string }
  | { tipo: "tabela"; colunas: string[]; linhas: string[][] }
  | { tipo: "barras"; titulo?: string; itens: { rotulo: string; valor: number }[] }
  | { tipo: "grafico"; titulo?: string; formato: "linha" | "pizza"; rotulos: string[]; series: { nome: string; valores: number[] }[] };

export type RichComponentPart = { kind: "text"; text: string } | { kind: "component"; component: RichComponent };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

export function validateRichComponent(json: string): RichComponent | null {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!isRecord(value)) return null;
  if (value.tipo === "cartao" && isText(value.titulo, 120) && isText(value.corpo, 1000)) {
    return { tipo: "cartao", titulo: value.titulo as string, corpo: value.corpo as string };
  }
  const columns = value.colunas;
  if (value.tipo === "tabela" && Array.isArray(columns) && columns.length >= 1 && columns.length <= 6 &&
      columns.every((item) => typeof item === "string") && Array.isArray(value.linhas) && value.linhas.length >= 1 && value.linhas.length <= 50 &&
      value.linhas.every((row) => Array.isArray(row) && row.length === columns.length && row.every((cell) => isText(cell, 200)))) {
    return { tipo: "tabela", colunas: columns as string[], linhas: value.linhas as string[][] };
  }
  if (value.tipo === "barras" && (value.titulo === undefined || isText(value.titulo, 120)) && Array.isArray(value.itens) && value.itens.length >= 1 && value.itens.length <= 12 &&
      value.itens.every((item) => isRecord(item) && isText(item.rotulo, 60) && typeof item.valor === "number" && Number.isFinite(item.valor) && item.valor >= 0)) {
    return { tipo: "barras", ...(value.titulo === undefined ? {} : { titulo: value.titulo as string }), itens: value.itens as { rotulo: string; valor: number }[] };
  }
  if (value.tipo === "grafico" && (value.titulo === undefined || isText(value.titulo, 120)) &&
      (value.formato === "linha" || value.formato === "pizza") && Array.isArray(value.rotulos) && value.rotulos.length >= 1 && value.rotulos.length <= 12 &&
      value.rotulos.every((label) => typeof label === "string" && label.length <= 60) && Array.isArray(value.series) &&
      value.series.length >= 1 && value.series.length <= (value.formato === "linha" ? 6 : 1) &&
      value.series.every((series) => isRecord(series) && isText(series.nome, 60) && Array.isArray(series.valores) && series.valores.length === (value.rotulos as unknown[]).length &&
        series.valores.every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) &&
      (value.formato !== "pizza" || (value.series.length === 1 && (value.series[0] as { valores: number[] }).valores.some((number) => number > 0)))) {
    return { tipo: "grafico", ...(value.titulo === undefined ? {} : { titulo: value.titulo as string }), formato: value.formato, rotulos: value.rotulos as string[], series: value.series as { nome: string; valores: number[] }[] };
  }
  return null;
}

export function splitRichComponents(text: string): RichComponentPart[] {
  const parts: RichComponentPart[] = [];
  const pattern = /```componente\s*\n([\s\S]*?)```/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ kind: "text", text: text.slice(cursor, start) });
    const original = match[0];
    const component = validateRichComponent(match[1] ?? "");
    parts.push(component ? { kind: "component", component } : { kind: "text", text: original });
    cursor = start + original.length;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  if (!parts.length) return [{ kind: "text", text }];
  return parts;
}
