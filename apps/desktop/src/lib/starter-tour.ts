export type TourPageId = "dashboard" | "conversations" | "tasks" | "settings";

export const STARTER_TOUR_STEPS = [
  { id: "dashboard", title: "Início", text: "Aqui você encontra uma visão geral do que aparece no workspace.", pageId: "dashboard" },
  { id: "conversations", title: "Conversas", text: "Este é o espaço para conversar com seus bots.", pageId: "conversations" },
  { id: "tasks", title: "Tarefas", text: "Aqui fica sua lista de tarefas.", pageId: "tasks" },
  { id: "settings", title: "Configurações", text: "Aqui você configura credenciais, modelos e preferências.", pageId: "settings" },
] as const satisfies readonly { id: string; title: string; text: string; pageId: TourPageId }[];

export const TOUR_DONE_KEY = "grupo-jadson.tour-done";

export function shouldShowTour(stored: string | null | undefined, _storageFailed: boolean): boolean {
  return stored !== "1";
}

export function nextStepIndex(index: number): number {
  return Math.min(STARTER_TOUR_STEPS.length - 1, Math.max(0, index) + 1);
}

export function previousStepIndex(index: number): number {
  return Math.max(0, Math.min(STARTER_TOUR_STEPS.length - 1, index) - 1);
}

export function markTourDone(write: (key: string, value: string) => void): boolean {
  try { write(TOUR_DONE_KEY, "1"); return true; } catch { return false; }
}

export function readTourDone(read: (key: string) => string | null): { stored: string | null; storageFailed: boolean } {
  try { return { stored: read(TOUR_DONE_KEY), storageFailed: false }; }
  catch { return { stored: null, storageFailed: true }; }
}
