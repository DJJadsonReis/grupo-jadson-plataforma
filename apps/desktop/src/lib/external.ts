import { openUrl } from "@tauri-apps/plugin-opener";

/** Dentro do app Tauri (.exe/instalador), `window.open` não abre o navegador: usa o plugin oficial. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Abre um link externo no navegador padrão do computador.
 * No app instalado usa `@tauri-apps/plugin-opener` (permitido só nos domínios de `capabilities/default.json`);
 * no navegador comum (modo dev) usa `window.open`.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
