export type Edition = "equipe" | "pessoal";

export type StartupScreen = "welcome" | "loading" | "login" | "workspace";

export function startupScreen(input: {
  firstRunComplete: boolean;
  editionLoaded: boolean;
  needsLogin: boolean;
  edition: Edition;
  hasSession: boolean;
}): StartupScreen {
  if (!input.firstRunComplete) return "welcome";
  if (!input.editionLoaded) return "loading";
  if (input.needsLogin && needsSignIn(input.edition, 1, input.hasSession)) return "login";
  return "workspace";
}

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
