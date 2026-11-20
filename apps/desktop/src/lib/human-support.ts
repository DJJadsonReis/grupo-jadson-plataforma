export type HumanSupportStatus = "aberto" | "assumido" | "resolvido";
export function humanSupportStatusLabel(status: HumanSupportStatus): string {
  return status === "aberto" ? "Aberto" : status === "assumido" ? "Assumido" : "Resolvido";
}
export function canClaimHumanSupport(status: HumanSupportStatus, isAttendant: boolean): boolean {
  return isAttendant && status === "aberto";
}
export function canResolveHumanSupport(status: HumanSupportStatus, claimedBy: string | null, personId: string, isAdmin: boolean): boolean {
  return status === "assumido" && (isAdmin || claimedBy === personId);
}
