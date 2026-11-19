import { describe, expect, it, vi } from "vitest";
import {
  getSpeechRecognitionConstructor,
  installOnDeviceSpeech,
  onDeviceSpeech,
  requireOnDeviceRecognition,
  speechRecognitionErrorMessage,
  supportsOnDeviceSpeech,
  type SpeechRecognitionLike,
} from "./speech-dictation";

class LocalRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  processLocally = false;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  start() {}
  stop() {}
}

class RemoteOnlyRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  start() {}
  stop() {}
}

describe("on-device speech dictation", () => {
  it("uses the standard constructor and supports the WebKit-prefixed name", () => {
    const standard = LocalRecognition;
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: standard })).toBe(standard);
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: standard })).toBe(standard);
    expect(getSpeechRecognitionConstructor({})).toBeUndefined();
  });

  it("requires and enables explicit local processing", () => {
    const recognition = new LocalRecognition();
    expect(requireOnDeviceRecognition(recognition)).toBe(true);
    expect(recognition.processLocally).toBe(true);
    expect(requireOnDeviceRecognition(new RemoteOnlyRecognition())).toBe(false);
  });

  it("only installs the on-device language pack from a supported Web Speech implementation", async () => {
    Object.defineProperty(LocalRecognition.prototype, "processLocally", { value: false, writable: true, configurable: true });
    const install = vi.fn(async ({ langs, processLocally }: { langs: string[]; processLocally: true }) => langs[0] === "pt-BR" && processLocally);
    Object.assign(LocalRecognition, { available: async () => "downloadable", install });
    expect(supportsOnDeviceSpeech(LocalRecognition)).toBe(true);
    expect(supportsOnDeviceSpeech(RemoteOnlyRecognition)).toBe(false);
    await expect(onDeviceSpeech(LocalRecognition, "pt-BR")).resolves.toBe("downloadable");
    await expect(onDeviceSpeech(RemoteOnlyRecognition, "pt-BR")).resolves.toBe("unsupported");
    await expect(installOnDeviceSpeech(LocalRecognition, "pt-BR")).resolves.toBe(true);
    expect(install).toHaveBeenCalledWith({ langs: ["pt-BR"], processLocally: true });
  });

  it("explains missing permissions and unavailable local language support", () => {
    expect(speechRecognitionErrorMessage("not-allowed")).toContain("Permita o acesso ao microfone");
    expect(speechRecognitionErrorMessage("service-not-allowed")).toContain("reconhecimento local");
    expect(speechRecognitionErrorMessage("unexpected")).toContain("Nenhum áudio foi enviado");
  });
});
