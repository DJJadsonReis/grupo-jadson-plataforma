export type RoomMessage = { id: string; roomId: string; authorKind: "person" | "bot"; authorId: string; authorName: string; content: string; createdAt: string };
export type TeamRoom = { id: string; name: string; role: "admin" | "member"; createdAt: string };
export type TeamPerson = { id: string; name: string };

export function validateRoomName(name: string): string | null {
  if (!name.trim()) return "Informe o nome da sala.";
  if (name.length > 80) return "O nome da sala deve ter até 80 caracteres.";
  return null;
}
export function validateMessageText(text: string): string | null {
  if (!text.trim()) return "Escreva uma mensagem.";
  if (text.length > 4000) return "A mensagem deve ter até 4000 caracteres.";
  return null;
}
export function findMentionedBotNames(text: string, botNames: string[]): string[] {
  return botNames.filter((name, index) => botNames.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index &&
    new RegExp(`@${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "iu").test(text) &&
    !botNames.some((longer) => longer.length > name.length && longer.toLocaleLowerCase().startsWith(name.toLocaleLowerCase()) && new RegExp(`@${escapeRegExp(longer)}(?![\\p{L}\\p{N}_])`, "iu").test(text)));
}
function escapeRegExp(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
