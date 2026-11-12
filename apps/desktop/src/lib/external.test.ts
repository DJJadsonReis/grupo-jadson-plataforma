import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openUrl = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (...args: unknown[]) => openUrl(...args) }));

import { isTauri, openExternal } from "./external";

describe("openExternal", () => {
  let windowOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openUrl.mockReset();
    openUrl.mockResolvedValue(undefined);
    windowOpen = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no navegador comum usa window.open", async () => {
    vi.stubGlobal("window", { open: windowOpen });
    expect(isTauri()).toBe(false);
    await openExternal("https://x.com/djjadsonreis");
    expect(windowOpen).toHaveBeenCalledWith("https://x.com/djjadsonreis", "_blank", "noopener,noreferrer");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("dentro do Tauri usa o plugin oficial", async () => {
    vi.stubGlobal("window", { open: windowOpen, __TAURI_INTERNALS__: {} });
    expect(isTauri()).toBe(true);
    await openExternal("https://instagram.com/falajadson");
    expect(openUrl).toHaveBeenCalledWith("https://instagram.com/falajadson");
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("propaga a falha do plugin para quem chamou", async () => {
    vi.stubGlobal("window", { open: windowOpen, __TAURI_INTERNALS__: {} });
    openUrl.mockRejectedValue(new Error("scope"));
    await expect(openExternal("https://x.com/djjadsonreis")).rejects.toThrow("scope");
  });
});
