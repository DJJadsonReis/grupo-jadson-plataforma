export interface SpeechStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const AUTO_READ_KEY = "grupo-jadson.leitura-automatica";

export function cleanForSpeech(text: string): string {
  const cleaned = text
    .replace(/```componente\s*\n([\s\S]*?)```/g, (_block, json: string) => ` ${componentSpeech(json)} `)
    .replace(/```[\s\S]*?```/g, " (bloco de código omitido) ")
    .replace(/```[\s\S]*$/g, " (bloco de código omitido) ")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^\s*(?:[-+*]\s+|\d+\.\s+)/gm, "")
    .replace(/^\s*(?:-\s*){3,}$/gm, " ")
    .replace(/[*#_>~]/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 2000) return cleaned;
  const prefix = cleaned.slice(0, 2000);
  const sentenceEnd = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("!"), prefix.lastIndexOf("?"));
  if (sentenceEnd >= 0) return prefix.slice(0, sentenceEnd + 1).trimEnd();
  const space = prefix.lastIndexOf(" ");
  return (space >= 0 ? prefix.slice(0, space) : "").trimEnd();
}

function componentSpeech(json: string): string {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return "componente"; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "componente";
  const item = value as Record<string, unknown>;
  if (item.tipo === "cartao") return [item.titulo, item.corpo].filter((part): part is string => typeof part === "string").join(". ");
  if (item.tipo === "tabela" && Array.isArray(item.linhas) && Array.isArray(item.colunas)) return `Tabela com ${item.linhas.length} linhas e colunas ${item.colunas.filter((part): part is string => typeof part === "string").join(", ")}`;
  if (item.tipo === "barras" && Array.isArray(item.itens)) return item.itens.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const row = entry as Record<string, unknown>;
    return `${typeof row.rotulo === "string" ? row.rotulo : ""}: ${typeof row.valor === "number" ? row.valor : ""}`;
  }).filter(Boolean).join(". ");
  return "componente";
}

export function choosePtBrVoice(voices: { lang: string }[]): number | null {
  const exact = voices.findIndex((voice) => voice.lang.toLocaleLowerCase() === "pt-br");
  if (exact >= 0) return exact;
  const portuguese = voices.findIndex((voice) => voice.lang.toLocaleLowerCase().startsWith("pt"));
  return portuguese >= 0 ? portuguese : null;
}

export function loadAutoReadPreference(storage: SpeechStorage): boolean {
  try { return storage.getItem(AUTO_READ_KEY) === "1"; } catch { return false; }
}

export function saveAutoReadPreference(storage: SpeechStorage, value: boolean): void {
  try { storage.setItem(AUTO_READ_KEY, value ? "1" : "0"); } catch { /* Preferência permanece apenas nesta sessão. */ }
}

export function shouldAutoRead(input: {
  enabled: boolean;
  supported: boolean;
  message: { role: string; streaming: boolean; id: string };
  lastSpokenId: string | null;
  loadedFromHistory: boolean;
}): boolean {
  return input.enabled && input.supported && input.message.role === "assistant" && !input.message.streaming &&
    !input.loadedFromHistory && input.message.id !== input.lastSpokenId;
}
