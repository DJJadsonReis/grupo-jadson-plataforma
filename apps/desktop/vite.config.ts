import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ENV_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEV_TOKEN_PATH = "/__gj/dev-token";

/**
 * Entrega o token do sistema ao desktop SOMENTE em desenvolvimento (`vite` / `tauri dev`).
 * O valor vem de GJ_DEV_API_TOKEN no .env.local. Não tem prefixo VITE_, então não entra no bundle.
 * Não existe em `vite build`: o plugin roda só no servidor de desenvolvimento.
 * Só responde a requisições da mesma origem (Sec-Fetch-Site: same-origin), para que outra página
 * no navegador não consiga ler o token.
 */
function devTokenPlugin(token: string): Plugin {
  return {
    name: "gj-dev-token",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(DEV_TOKEN_PATH, (req, res) => {
        if (!token || req.method !== "GET" || req.headers["sec-fetch-site"] !== "same-origin") {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ token }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const devToken = loadEnv(mode, ENV_DIR, "").GJ_DEV_API_TOKEN ?? "";
  return {
    envDir: "./",
    plugins: [react(), devTokenPlugin(devToken)],
    server: { port: 1420, strictPort: true },
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
  };
});
