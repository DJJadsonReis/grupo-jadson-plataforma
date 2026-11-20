import { extrairTextoDocx, extrairTextoXlsx } from "./office-text";

describe("extração Office", () => {
  it("extrai parágrafos DOCX, entidades, quebra e tabulação", () => {
    expect(extrairTextoDocx("<w:document><w:p><w:r><w:t>Olá &amp; </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p><w:p><w:r><w:t>Fim</w:t></w:r></w:p></w:document>")).toBe("Olá & mundo\nFim");
    expect(extrairTextoDocx("<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>")).toBe("A\tB\nC");
  });
  it("preserva parágrafo DOCX vazio auto-fechado entre parágrafos", () => {
    expect(extrairTextoDocx('<w:document><w:p><w:r><w:t>Um</w:t></w:r></w:p><w:p w:rsidR="x"/><w:p><w:r><w:t>Dois</w:t></w:r></w:p></w:document>')).toBe("Um\n\nDois");
  });
  it("extrai strings compartilhadas, números, inline strings e planilhas", () => {
    const arquivos = new Map([
      ["xl/workbook.xml", '<workbook><sheets><sheet name="Dados"/><sheet name="Segunda"/></sheets></workbook>'],
      ["xl/sharedStrings.xml", "<sst><si><t>Texto</t></si></sst>"],
      ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheetData></worksheet>'],
      ["xl/worksheets/sheet2.xml", '<worksheet><sheetData><row><c t="inlineStr"><is><t>Direto</t></is></c></row></sheetData></worksheet>'],
    ]);
    expect(extrairTextoXlsx(arquivos)).toContain("== Planilha: Dados ==\nTexto\t42");
    expect(extrairTextoXlsx(arquivos)).toContain("== Planilha: Segunda ==\nDireto");
  });
  it("rejeita DTD", () => {
    expect(() => extrairTextoDocx('<!DOCTYPE a [<!ENTITY x "y">]><a/>')).toThrow("INVALID_DOCUMENT");
  });
  it("preserva coluna vazia de célula XLSX auto-fechada", () => {
    const arquivos = new Map([
      ["xl/workbook.xml", '<workbook><sheets><sheet name="Dados"/></sheets></workbook>'],
      ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="B1" s="2"/><c r="C1"><v>99</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c><c r="C2"><v>3</v></c></row></sheetData></worksheet>'],
    ]);
    expect(extrairTextoXlsx(arquivos)).toBe("== Planilha: Dados ==\nNome\t\t99\n1\t2\t3");
  });
  it("não absorve a linha seguinte após linha XLSX vazia auto-fechada", () => {
    const arquivos = new Map([
      ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c><v>Primeira</v></c></row><row r="2" s="1" customFormat="1"/><row r="3"><c><v>Terceira</v></c></row></sheetData></worksheet>'],
    ]);
    expect(extrairTextoXlsx(arquivos)).toBe("== Planilha: sheet1.xml ==\nPrimeira\n\nTerceira");
  });
  it("preserva índice de strings compartilhadas após item auto-fechado", () => {
    const arquivos = new Map([
      ["xl/sharedStrings.xml", "<sst><si/><si><t>Texto correto</t></si></sst>"],
      ["xl/worksheets/sheet1.xml", '<worksheet><sheetData><row><c t="s"><v>1</v></c></row></sheetData></worksheet>'],
    ]);
    expect(extrairTextoXlsx(arquivos)).toBe("== Planilha: sheet1.xml ==\nTexto correto");
  });
});
