import { classifyTask, failureReason, isRetryableModelError, modelAttempts } from "./model-routing";

describe("model routing", () => {
  const primary = { providerId: "p1", model: "main" };
  it("chooses vision, then code signals, then text", () => {
    expect(classifyTask("hello", true)).toBe("vision");
    expect(classifyTask("```ts\ncode\n```", false)).toBe("code");
    expect(classifyTask("hello", false, [{ name: "src.ts" }])).toBe("code");
    expect(classifyTask("hello", false)).toBe("text");
  });
  it("uses task target before fallbacks, preserving order and removing duplicate provider/model pairs", () => {
    expect(modelAttempts(primary, { taskModels: { vision: { providerId: "p2", model: "vision" } }, fallbacks: [primary, { providerId: "p3", model: "reserve" }] }, "vision"))
      .toEqual([{ providerId: "p2", model: "vision", fallback: false }, { ...primary, fallback: true }, { providerId: "p3", model: "reserve", fallback: true }]);
    expect(modelAttempts(primary, { taskModels: { code: { providerId: "p4", model: "code" } } }, "code")[0]).toMatchObject({ providerId: "p4", model: "code" });
    expect(modelAttempts(primary, {}, "vision")[0]).toMatchObject({ ...primary, fallback: false });
  });
  it.each([429, 500, 503, 401, 403, 404])("retries HTTP %i before text", (status) => expect(isRetryableModelError({ status }, false, false)).toBe(true));
  it("retries timeouts and network errors, but not after text, on cancellation, or for tool limit errors", () => {
    expect(isRetryableModelError({ name: "AbortError" }, false, false)).toBe(true);
    expect(isRetryableModelError({ name: "TimeoutError" }, false, false)).toBe(true);
    expect(isRetryableModelError({ status: 400, response: { code: "PROVIDER_UNAVAILABLE" } }, false, false)).toBe(true);
    expect(isRetryableModelError({ status: 400, response: { modelUnavailable: true } }, false, false)).toBe(true);
    expect(isRetryableModelError(new Error("network"), false, false)).toBe(true);
    expect(isRetryableModelError({ status: 429 }, true, false)).toBe(false);
    expect(isRetryableModelError({ status: 429 }, false, true)).toBe(false);
    expect(isRetryableModelError({ status: 400, response: { modelUnavailable: false } }, false, false)).toBe(false);
    expect(failureReason({ status: 429 })).toBe("http-429");
  });
});
