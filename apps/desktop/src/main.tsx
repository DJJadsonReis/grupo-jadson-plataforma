import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/workspace.css";
import "./styles/design-tokens.css";
import "./styles/shell-redesign.css";

// Janela de aplicativo: sem o menu de navegador (Voltar, Salvar como, Imprimir). Campos de texto mantêm o menu de copiar e colar.
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable=\"true\"]")) return;
  event.preventDefault();
});

/** Se uma tela falhar, mostra o erro e um botão para recarregar, em vez de deixar a janela preta. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    console.error("Erro na tela:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f0f10", color: "#f2f2f2", padding: 24, fontFamily: "inherit" }}>
        <div style={{ maxWidth: 520, display: "grid", gap: 12, textAlign: "center" }}>
          <strong style={{ fontSize: 18 }}>Esta tela não pôde ser exibida.</strong>
          <small style={{ opacity: 0.7, wordBreak: "break-word" }}>{this.state.error}</small>
          <button
            onClick={() => window.location.reload()}
            style={{ justifySelf: "center", padding: "10px 18px", borderRadius: 8, border: 0, background: "#d4af37", color: "#111", fontWeight: 600, cursor: "pointer" }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
