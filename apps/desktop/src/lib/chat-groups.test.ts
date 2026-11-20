import { describe, expect, it } from "vitest";
import { groupChatsByDate } from "./chat-groups";
import type { Conversation } from "./workspace";

const ref = new Date(2026, 10, 20, 12);
const chat = (id: string, updatedAt: number): Conversation => ({ id, title: id, updatedAt, messages: [] });
const atLocal = (days: number, hour = 12, minute = 0) => new Date(2026, 10, 20 - days, hour, minute).getTime();

describe("groupChatsByDate", () => {
  it("agrupa hoje, ontem, até sete dias e mais antigas com referência fixa", () => {
    const grouped = groupChatsByDate([chat("hoje", atLocal(0)), chat("ontem", atLocal(1)), chat("semana", atLocal(7)), chat("antiga", atLocal(8))], ref);
    expect(grouped.Hoje.map(({ id }) => id)).toEqual(["hoje"]);
    expect(grouped.Ontem.map(({ id }) => id)).toEqual(["ontem"]);
    expect(grouped["Últimos 7 dias"].map(({ id }) => id)).toEqual(["semana"]);
    expect(grouped["Mais antigas"].map(({ id }) => id)).toEqual(["antiga"]);
  });
  it("mantém a lista vazia e classifica 23h59 de ontem como Ontem no calendário local", () => {
    expect(groupChatsByDate([], ref).Hoje).toEqual([]);
    const grouped = groupChatsByDate([chat("noite", atLocal(1, 23, 59))], ref);
    expect(grouped.Ontem.map(({ id }) => id)).toEqual(["noite"]);
    expect(grouped.Hoje).toEqual([]);
  });
});
