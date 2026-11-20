/** Marcador fixo para valores que podem autenticar chamadas a serviços externos. */
export const SECRET_REDACTION_MARKER = "[REDACTED]";

/** Valores conhecidos menores que este limite são ignorados para evitar substituir palavras curtas. */
export const MIN_KNOWN_SECRET_LENGTH = 8;

const SECRET_ENV_NAME = /(?:KEY(?:_ID)?|TOKEN|SECRET|PASSWORD|DATABASE_URL|REDIS_URL)$/i;
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\btvly-[A-Za-z0-9_-]{8,}\b/gi,
  /\b(?:secret|ntn)_[A-Za-z0-9_-]{8,}\b/gi,
  /\bAIza[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)=([^&\s]+)/gi,
];

/** Seleciona valores de chave/credencial já carregados no ambiente, sem ler ou gravar arquivos. */
export function environmentSecrets(environment: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(environment)
    .filter(([name]) => SECRET_ENV_NAME.test(name))
    .map(([, value]) => value?.trim() ?? "")
    .filter((value) => value.length >= MIN_KNOWN_SECRET_LENGTH);
}

/** Mascara valores explícitos e formatos comuns; textos curtos não são tratados como segredos. */
export function maskSecrets(value: string, knownSecrets: readonly string[] = []): string {
  let masked = value;
  const known = [...new Set([...environmentSecrets(), ...knownSecrets.map((secret) => secret.trim())])]
    .filter((secret) => secret.length >= MIN_KNOWN_SECRET_LENGTH)
    .sort((left, right) => right.length - left.length);
  for (const secret of known) masked = masked.split(secret).join(SECRET_REDACTION_MARKER);
  masked = masked.replace(/([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)[^@\s/]+@/gi, `$1${SECRET_REDACTION_MARKER}@`);
  for (const pattern of SECRET_PATTERNS) masked = masked.replace(pattern, SECRET_REDACTION_MARKER);
  return masked;
}

/** Mascara recursivamente strings de resultados estruturados sem mudar sua forma. */
export function maskSecretValues(value: unknown, knownSecrets: readonly string[] = []): unknown {
  if (typeof value === "string") return maskSecrets(value, knownSecrets);
  if (Array.isArray(value)) return value.map((item) => maskSecretValues(item, knownSecrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskSecretValues(item, knownSecrets)]));
  }
  return value;
}
