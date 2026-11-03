import { ServiceUnavailableException } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";

describe("OpenAiProvider configuration", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("reports the provider as unconfigured when no key exists", () => {
    delete process.env.OPENAI_API_KEY;
    expect(new OpenAiProvider().isConfigured()).toBe(false);
  });

  it("returns a configuration error before any network request", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAiProvider();
    await expect(provider.stream({ messages: [{ role: "user", content: "hello" }] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
