import { describe, expect, it } from "vitest";
import { groupSelectableProviders, hasLegacyProviderKey, validateProviderDraft, type ProviderDraft } from "./model-providers";

const valid: ProviderDraft = { kind: "openai", name: "OpenAI teste", baseUrl: "", apiKey: "sk-teste-falso-000", allowLocal: false };
describe("model providers pure helpers", () => {
  it("validates name and key in Portuguese", () => {
    expect(validateProviderDraft({ ...valid, name: " " })).toMatch(/nome/i);
    expect(validateProviderDraft({ ...valid, apiKey: "" })).toMatch(/chave/i);
  });
  it("requires custom URL and gates local HTTP", () => {
    expect(validateProviderDraft({ ...valid, kind: "custom", baseUrl: "" })).toMatch(/URL/i);
    expect(validateProviderDraft({ ...valid, kind: "custom", baseUrl: "http://provedor.invalid" })).toMatch(/HTTPS/i);
    expect(validateProviderDraft({ ...valid, kind: "custom", baseUrl: "http://127.0.0.1:9000/v1", allowLocal: true })).toBeNull();
  });
  it("groups models under provider names and ignores empty providers", () => {
    expect(groupSelectableProviders([{ providerId: "p1", providerName: "Falso", models: [{ id: "m1", label: "Modelo 1" }] }, { providerId: "p2", providerName: "Vazio", models: [] }])).toEqual([{ value: "p1:m1", label: "Falso — Modelo 1", providerId: "p1", model: "m1" }]);
  });
  it("shows previous configuration only when its saved key exists", () => {
    expect(hasLegacyProviderKey([{ id: "legacy", hasKey: true }])).toBe(true);
    expect(hasLegacyProviderKey([{ id: "legacy", hasKey: false }])).toBe(false);
  });
});
