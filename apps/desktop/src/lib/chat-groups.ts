import type { Conversation } from "./workspace";

export type ChatGroup = "Hoje" | "Ontem" | "Últimos 7 dias" | "Mais antigas";
export type GroupedChats = Record<ChatGroup, Conversation[]>;
const DAY = 24 * 60 * 60 * 1000;

/** Agrupa pelo calendário local para respeitar a data mostrada à pessoa. */
export function groupChatsByDate(items: Conversation[], referenceDate: Date): GroupedChats {
  const today = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const groups: GroupedChats = { Hoje: [], Ontem: [], "Últimos 7 dias": [], "Mais antigas": [] };
  for (const item of items) {
    const date = new Date(item.updatedAt);
    const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const age = Math.floor((today - day) / DAY);
    const group: ChatGroup = age <= 0 ? "Hoje" : age === 1 ? "Ontem" : age <= 7 ? "Últimos 7 dias" : "Mais antigas";
    groups[group].push(item);
  }
  return groups;
}
