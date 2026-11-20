export type Edition = "equipe" | "pessoal";

export function parseEditionResponse(body: unknown): Edition {
  if (body && typeof body === "object" && "edition" in body) {
    const edition = (body as { edition?: unknown }).edition;
    if (edition === "equipe" || edition === "pessoal") return edition;
  }
  return "equipe";
}

export function needsSignIn(edition: Edition, providersCount: number, hasSession: boolean): boolean {
  return edition === "equipe" && providersCount > 0 && !hasSession;
}

export function canShowSharing(edition: Edition): boolean {
  return edition === "equipe";
}
