import { describe, expect, it } from "vitest";
import { groupCatalogue, suggestModels } from "./model-catalogue";

const data = [
  { id: "openai", name: "OpenAI", configured: true, defaultModel: "gpt-4o-mini", models: [{ provider: "openai", id: "gpt-4o-mini", label: "GPT-4o mini" }] },
  { id: "endpoint", name: "Endpoint compatível", configured: false, defaultModel: null, models: [] },
];

describe("catálogo de modelos", () => {
  it("agrupa provedores válidos e ignora resposta inválida", () => {
    expect(groupCatalogue([...data, null, { id: 3 }])).toEqual(data);
    expect(groupCatalogue(null)).toEqual([]);
  });

  it("sugere modelos por identificador ou rótulo e mantém entrada livre", () => {
    expect(suggestModels(data, "gpt")).toHaveLength(1);
    expect(suggestModels(data, "OpenAI")).toHaveLength(0);
    expect(suggestModels(data, "")).toHaveLength(1);
  });
});
