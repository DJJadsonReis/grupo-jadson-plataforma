/**
 * Emite texto em pedaços sem deixar um segredo escapar pela divisão entre pedaços.
 *
 * O mascarador olha o texto inteiro. Para continuar exibindo a resposta enquanto ela chega, o texto
 * é segurado e só se libera até o último espaço em branco, deixando uma janela de `holdChars` no fim.
 * Como os padrões de segredo não contêm espaços (exceto `Bearer <token>`, tratado abaixo), um segredo
 * nunca fica cortado entre duas partes emitidas.
 *
 * Limite conhecido: um valor conhecido que contenha espaço pode ser cortado. Segredos reais de
 * provedores não têm espaço; o risco fica registrado no relatório.
 */
export const DEFAULT_HOLD_CHARS = 512;

export class MaskedTextStream {
  private buffer = "";

  constructor(
    private readonly mask: (text: string) => string,
    private readonly emit: (text: string) => void,
    private readonly holdChars = DEFAULT_HOLD_CHARS,
  ) {}

  /** Recebe texto bruto e emite a parte que já não pode conter um segredo cortado. */
  push(text: string): void {
    if (!text) return;
    this.buffer += text;
    if (this.buffer.length <= this.holdChars) return;
    const limit = this.buffer.length - this.holdChars;
    // Procura o último espaço em branco antes do limite cujo prefixo não termine em "Bearer".
    for (let index = limit - 1; index >= 0; index -= 1) {
      if (!/\s/.test(this.buffer.charAt(index))) continue;
      const prefix = this.buffer.slice(0, index + 1);
      if (/\bbearer\s*$/i.test(prefix)) continue;
      this.emit(this.mask(prefix));
      this.buffer = this.buffer.slice(index + 1);
      return;
    }
  }

  /** Fim da resposta: emite o que restou, já mascarado. */
  flush(): void {
    if (!this.buffer) return;
    this.emit(this.mask(this.buffer));
    this.buffer = "";
  }

  /** Descarta o que foi segurado (ex.: a rodada virou chamada de ferramenta, não resposta). */
  discard(): void {
    this.buffer = "";
  }
}
