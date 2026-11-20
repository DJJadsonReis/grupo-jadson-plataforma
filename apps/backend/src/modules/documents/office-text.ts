function invalid(): never {
  throw new Error("INVALID_DOCUMENT");
}

function protegerXml(xml: string): void {
  if (/<!DOCTYPE/i.test(xml)) invalid();
}

function decodificar(texto: string): string {
  return texto.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entidade, nome: string) => {
    const chaves: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (nome[0] !== "#") return chaves[nome.toLowerCase()] ?? entidade;
    const valor = nome[1]?.toLowerCase() === "x" ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10);
    try { return Number.isInteger(valor) && valor >= 0 && valor <= 0x10ffff ? String.fromCodePoint(valor) : entidade; } catch { return entidade; }
  });
}

function elementos(xml: string, nome: string): string[] {
  const escaped = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...xml.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*?)?(?:\\/>|>([\\s\\S]*?)<\\/${escaped}\\s*>)`, "g"))].map((m) => m[1] ?? "");
}

function elementosComAtributos(xml: string, nome: string): Array<{ atributos: string; conteudo: string }> {
  const escaped = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const encontrados: Array<{ atributos: string; conteudo: string }> = [];
  const re = new RegExp(`<${escaped}\\b([^>]*?)(?:\\s*/>|>([\\s\\S]*?)<\\/${escaped}\\s*>)`, "g");
  for (const m of xml.matchAll(re)) if (m[1] !== undefined) encontrados.push({ atributos: m[1], conteudo: m[2] ?? "" });
  return encontrados;
}

function tagsComAtributos(xml: string, nome: string): string[] {
  const escaped = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...xml.matchAll(new RegExp(`<${escaped}\\b([^>]*)\\/?\\s*>`, "g"))].flatMap((m) => m[1] === undefined ? [] : [m[1]]);
}

function textoXml(xml: string): string {
  return [...xml.matchAll(/<[^>]+>|[^<]+/g)].map(([token]) => {
    if (/^<w:t(?:\s[^>]*)?>/.test(token) || /^<t(?:\s[^>]*)?>/.test(token)) return "";
    if (token === "<w:br/>" || token === "<w:br />" || token.startsWith("<w:br ")) return "\n";
    if (token === "<w:tab/>" || token === "<w:tab />" || token.startsWith("<w:tab ")) return "\t";
    return token.startsWith("<") ? "" : decodificar(token);
  }).join("");
}

export function extrairTextoDocx(xml: string): string {
  protegerXml(xml);
  return elementos(xml, "w:p").map(textoXml).join("\n").trim();
}

export function extrairTextoXlsx(arquivos: Map<string, string>): string {
  const sharedXml = arquivos.get("xl/sharedStrings.xml") ?? "";
  if (sharedXml) protegerXml(sharedXml);
  const shared = elementos(sharedXml, "si").map((si) => elementos(si, "t").map(decodificar).join(""));
  const sheets = [...arquivos.keys()].filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/.test(nome))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1]) - Number(b.match(/sheet(\d+)/)?.[1]));
  return sheets.map((caminho) => {
    const xml = arquivos.get(caminho)!;
    protegerXml(xml);
    const linhas = elementos(xml, "row").map((row) => elementosComAtributos(row, "c").map(({ atributos, conteudo: celula }) => {
      const tipo = atributos.match(/\bt="([^"]+)"/)?.[1];
      if (tipo === "s") {
        const indice = Number(elementos(celula, "v")[0]);
        return shared[indice] ?? "";
      }
      if (tipo === "inlineStr") return elementos(celula, "is").flatMap((is) => elementos(is, "t")).map(decodificar).join("");
      return decodificar(elementos(celula, "v")[0] ?? "");
    }).join("\t")).join("\n");
    const idx = Number(caminho.match(/sheet(\d+)/)?.[1]);
    const workbook = arquivos.get("xl/workbook.xml") ?? "";
    if (workbook) protegerXml(workbook);
    const sheetsXml = elementos(workbook, "sheets")[0] ?? "";
    const nomePlanilha = tagsComAtributos(sheetsXml, "sheet")[idx - 1]?.match(/\bname="([^"]+)"/)?.[1];
    return `== Planilha: ${nomePlanilha ? decodificar(nomePlanilha) : caminho.split("/").pop()} ==\n${linhas}`;
  }).join("\n\n");
}
