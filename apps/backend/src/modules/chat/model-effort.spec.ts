import { supportsEffort } from "./model-effort";

describe("supportsEffort", () => {
  it.each([
    ["openai", "o3", true], ["anthropic", "claude-sonnet-4-5", true],
    ["gemini", "gemini-2.5-pro", true], ["xai", "grok-3-mini", true],
    ["openai", "gpt-4.1", false], ["anthropic", "claude-3-5-haiku-latest", false],
    ["ollama", "qwen", false], ["custom", "model-x", false], ["unknown", "o3", false],
  ])("%s / %s => %s", (provider, model, expected) => {
    expect(supportsEffort(provider, model)).toBe(expected);
  });
});
