export type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

export type SpeechErrorEvent = { error: string };

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type OnDeviceSpeechStatus = "checking" | "available" | "downloading" | "downloadable" | "unavailable" | "unsupported";
type SpeechOptions = { langs: string[]; processLocally: true };
type SpeechRecognitionStatics = {
  available?: (options: SpeechOptions) => Promise<unknown>;
  install?: (options: SpeechOptions) => Promise<unknown>;
  prototype?: object;
};
export type SpeechRecognitionWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function getSpeechRecognitionConstructor(scope: SpeechRecognitionWindow): SpeechRecognitionConstructor | undefined {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function supportsOnDeviceSpeech(Recognition: unknown): Recognition is SpeechRecognitionConstructor {
  if (typeof Recognition !== "function") return false;
  const statics = Recognition as SpeechRecognitionStatics;
  return typeof statics.available === "function"
    && typeof statics.install === "function"
    && typeof statics.prototype === "object"
    && statics.prototype !== null
    && "processLocally" in statics.prototype;
}

export async function onDeviceSpeech(Recognition: unknown, language: string): Promise<OnDeviceSpeechStatus> {
  if (!supportsOnDeviceSpeech(Recognition)) return "unsupported";
  try {
    const status = await (Recognition as SpeechRecognitionStatics).available?.({ langs: [language], processLocally: true });
    return status === "available" || status === "downloading" || status === "downloadable" || status === "unavailable"
      ? status
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Returns false unless the implementation exposes the explicit on-device mode. */
export function requireOnDeviceRecognition(recognition: SpeechRecognitionLike): boolean {
  if (!("processLocally" in recognition)) return false;
  recognition.processLocally = true;
  return recognition.processLocally === true;
}

/** Called from the microphone click so a language pack can be downloaded with user activation. */
export async function installOnDeviceSpeech(Recognition: unknown, language: string): Promise<boolean> {
  if (!supportsOnDeviceSpeech(Recognition)) return false;
  try {
    return await (Recognition as SpeechRecognitionStatics).install?.({ langs: [language], processLocally: true }) === true;
  } catch {
    return false;
  }
}

export function speechRecognitionErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed": return "Permita o acesso ao microfone nas configurações do Windows e tente novamente.";
    case "audio-capture": return "Não foi possível acessar um microfone neste computador.";
    case "no-speech": return "Nenhuma fala foi detectada. Tente novamente.";
    case "service-not-allowed":
    case "language-not-supported": return "O reconhecimento local em português não está disponível neste WebView ou neste computador.";
    case "aborted": return "O ditado foi interrompido.";
    default: return "O ditado local não pôde iniciar. Nenhum áudio foi enviado a um serviço externo.";
  }
}
