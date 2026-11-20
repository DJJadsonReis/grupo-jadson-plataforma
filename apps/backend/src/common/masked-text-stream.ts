/** Emite texto em partes sem deixar segredos escaparem entre chunks. */
export const DEFAULT_HOLD_CHARS = 512;

const PRIVATE_KEY_BEGIN = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
const PRIVATE_KEY_END_SOURCE = "-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----";
const PRIVATE_KEY_MAX_BUFFER = 16 * 1024;
const BEGIN_PREFIX = "-----BEGIN ";
const END_PREFIX = "-----END ";
const END_SUFFIX = " PRIVATE KEY-----";
const END_MAX_TYPE_LENGTH = 64;

export class MaskedTextStream {
  private buffer = "";
  private discardingPrivateKey = false;
  private privateKeyRedacted = false;

  constructor(
    private readonly mask: (text: string) => string,
    private readonly emit: (text: string) => void,
    private readonly holdChars = DEFAULT_HOLD_CHARS,
  ) {}

  push(text: string): void {
    if (!text) return;
    this.buffer += text;
    this.processPrivateKeyBlocks();
    if (this.discardingPrivateKey || !this.buffer) return;

    const begin = PRIVATE_KEY_BEGIN.exec(this.buffer);
    const possibleBegin = begin ? begin.index : this.findPossibleBegin();
    const safeLength = possibleBegin >= 0 ? possibleBegin : this.buffer.length;
    if (safeLength <= this.holdChars) return;
    const limit = safeLength - this.holdChars;
    for (let index = limit - 1; index >= 0; index -= 1) {
      if (!/\s/.test(this.buffer.charAt(index))) continue;
      const prefix = this.buffer.slice(0, index + 1);
      if (/\bbearer\s*$/i.test(prefix)) continue;
      this.emit(this.mask(prefix));
      this.buffer = this.buffer.slice(index + 1);
      return;
    }
  }

  flush(): void {
    if (this.discardingPrivateKey) {
      this.buffer = "";
      this.discardingPrivateKey = false;
      this.privateKeyRedacted = false;
      return;
    }
    if (this.privateKeyRedacted) {
      this.buffer = "";
      this.privateKeyRedacted = false;
      return;
    }
    const begin = PRIVATE_KEY_BEGIN.exec(this.buffer);
    if (begin) {
      const prefix = this.buffer.slice(0, begin.index);
      if (prefix) this.emit(this.mask(prefix));
      this.emit("[REDACTED]");
      this.buffer = "";
      return;
    }
    if (this.buffer) this.emit(this.mask(this.buffer));
    this.buffer = "";
  }

  discard(): void {
    this.buffer = "";
    this.discardingPrivateKey = false;
    this.privateKeyRedacted = false;
  }

  private processPrivateKeyBlocks(): void {
    while (true) {
      if (this.discardingPrivateKey) {
        const end = new RegExp(PRIVATE_KEY_END_SOURCE).exec(this.buffer);
        if (!end) {
          this.buffer = this.buffer.slice(-END_PREFIX.length - END_MAX_TYPE_LENGTH - END_SUFFIX.length);
          return;
        }
        this.buffer = this.buffer.slice(end.index + end[0].length);
        this.discardingPrivateKey = false;
        this.privateKeyRedacted = false;
        continue;
      }

      const begin = PRIVATE_KEY_BEGIN.exec(this.buffer);
      if (!begin) return;
      const endPattern = new RegExp(PRIVATE_KEY_END_SOURCE, "g");
      endPattern.lastIndex = begin.index + begin[0].length;
      const end = endPattern.exec(this.buffer);
      if (!end) {
        if (this.buffer.length - begin.index <= PRIVATE_KEY_MAX_BUFFER) return;
        const prefix = this.buffer.slice(0, begin.index);
        if (prefix) this.emit(this.mask(prefix));
        this.emit("[REDACTED]");
        this.buffer = "";
        this.discardingPrivateKey = true;
        this.privateKeyRedacted = true;
        return;
      }

      const prefix = this.buffer.slice(0, begin.index);
      if (prefix) this.emit(this.mask(prefix));
      this.emit("[REDACTED]");
      this.buffer = this.buffer.slice(end.index + end[0].length);
    }
  }

  private findPossibleBegin(): number {
    const start = this.buffer.lastIndexOf("-----");
    if (start < 0) return -1;
    const candidate = this.buffer.slice(start);
    if (BEGIN_PREFIX.startsWith(candidate)) return start;
    if (!candidate.startsWith(BEGIN_PREFIX)) return -1;
    const rest = candidate.slice(BEGIN_PREFIX.length);
    return /^[A-Z0-9 ]{0,64}$/.test(rest) ? start : -1;
  }

}
