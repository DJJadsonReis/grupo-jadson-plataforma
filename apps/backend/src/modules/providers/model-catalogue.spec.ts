import { DEFAULT_MODELS, MODEL_CATALOGUE, MODEL_PROVIDER_NAMES } from "./model-catalogue";

describe("catálogo de modelos", () => {
  it("mantém IDs únicos e padrões pertencentes ao respectivo provedor", () => {
    const ids = MODEL_CATALOGUE.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [provider, model] of Object.entries(DEFAULT_MODELS)) {
      expect(MODEL_CATALOGUE.some((entry) => entry.provider === provider && entry.id === model)).toBe(true);
    }
    expect(Object.keys(MODEL_PROVIDER_NAMES)).toEqual(["openai", "anthropic", "gemini", "endpoint"]);
  });
});
