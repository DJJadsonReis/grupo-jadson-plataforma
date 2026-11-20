export type SharePerson = { id: string; name: string };
export type Share = { ownerId?: string; granteeId?: string; status: string };

export function validateShareTarget(ownerId: string, granteeId: string, people: SharePerson[]): string | null {
  if (!granteeId.trim()) return "Escolha uma pessoa.";
  if (granteeId === ownerId) return "Você não pode compartilhar com sua própria pessoa.";
  if (!people.some((person) => person.id === granteeId)) return "Pessoa não encontrada na equipe.";
  return null;
}
export function shareStatusLabel(status: string): string { return status === "approved" ? "Ativo" : "Aguardando aprovação do admin"; }
export function canRevokeShare(currentPersonId: string, isAdmin: boolean, share: Share): boolean { return isAdmin || share.ownerId === currentPersonId; }
