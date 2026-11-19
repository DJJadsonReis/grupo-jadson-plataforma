import { extrairTextoDocx, extrairTextoXlsx } from "./office-text";

describe("extração Office", () => {
  it("extrai parágrafos DOCX, entidades, quebra e tabulação", () => {
    expect(extrairTextoDocx("<w:document><w:p><w:r><w:t>Olá &amp; </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p><w:p><w:r><w:t>Fim</w:t></w:r></w:p></w:document>")).toBe("Olá & mundo\nFim");
    expect(extrairTextoDocx("<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>")).toBe("A\tB\nC");
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
});
