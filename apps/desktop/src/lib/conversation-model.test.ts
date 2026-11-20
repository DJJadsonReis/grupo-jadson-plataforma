import { describe, expect, it } from "vitest";
import { conversationModelLabel, initialConversationModel, modelChoiceForSelection, modelSelectionError } from "./conversation-model";

describe("conversation model helpers", () => {
  const providers = [{ providerId: "provider-1", providerName: "OpenAI", models: [{ id: "o3", label: "o3" }] }];
  it("labels the provider and model in Portuguese", () => expect(conversationModelLabel({ providerId: "provider-1", model: "o3" }, providers)).toBe("OpenAI · o3"));
  it("initializes with a saved selection or the agent default", () => {
    expect(initialConversationModel("provider-1", "o3")).toBe("provider-1:o3");
    expect(initialConversationModel(null, null)).toBe("");
    expect(conversationModelLabel(null, providers)).toBe("Padrão do agente");
  });
  it("sends only an explicit choice", () => {
    expect(modelChoiceForSelection("provider-1:o3")).toEqual({ providerId: "provider-1", model: "o3" });
    expect(modelChoiceForSelection("")).toBeNull();
  });
  it("shows a discreet Portuguese error", () => expect(modelSelectionError()).toMatch(/Não foi possível salvar/));
});
