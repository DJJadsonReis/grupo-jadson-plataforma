import { describe, expect, it, vi } from "vitest";
import { DictationHttpClient } from "./dictation-api";

describe("DictationHttpClient", () => {
  it("propaga status HTTP e código de erro sem incluir corpo arbitrário", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: "UNAUTHORIZED", message: "Token inválido" }, { status: 401 }));
    const client = new DictationHttpClient("http://localhost/api/v1", fetcher);
    await expect(client.status()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });
});
