import { describe, expect, it, vi } from "vitest";
import { markTourDone, nextStepIndex, previousStepIndex, readTourDone, shouldShowTour, STARTER_TOUR_STEPS, TOUR_DONE_KEY, type TourPageId } from "./starter-tour";

describe("tour inicial", () => {
  it("define os quatro passos na ordem e nas páginas esperadas", () => {
    const pages: TourPageId[] = ["dashboard", "conversations", "tasks", "settings"];
    expect(STARTER_TOUR_STEPS).toHaveLength(4);
    expect(STARTER_TOUR_STEPS.map(({ pageId }) => pageId)).toEqual(pages);
    expect(STARTER_TOUR_STEPS.every(({ pageId }) => pages.includes(pageId))).toBe(true);
  });

  it("só esconde quando o armazenamento diz que já foi visto", () => {
    expect(shouldShowTour(null, false)).toBe(true);
    expect(shouldShowTour(undefined, false)).toBe(true);
    expect(shouldShowTour("1", false)).toBe(false);
    expect(shouldShowTour("0", false)).toBe(true);
    expect(shouldShowTour(null, true)).toBe(true);
  });

  it("limita o avanço e o retorno aos extremos", () => {
    expect(nextStepIndex(3)).toBe(3);
    expect(nextStepIndex(0)).toBe(1);
    expect(previousStepIndex(0)).toBe(0);
    expect(previousStepIndex(2)).toBe(1);
  });

  it("grava e lê somente a chave do tour e trata falhas de armazenamento", () => {
    const write = vi.fn();
    expect(markTourDone(write)).toBe(true);
    expect(write).toHaveBeenCalledWith(TOUR_DONE_KEY, "1");
    expect(markTourDone(() => { throw new Error("indisponível"); })).toBe(false);
    expect(readTourDone((key) => key === TOUR_DONE_KEY ? "1" : null)).toEqual({ stored: "1", storageFailed: false });
    expect(readTourDone(() => { throw new Error("indisponível"); })).toEqual({ stored: null, storageFailed: true });
  });
});
