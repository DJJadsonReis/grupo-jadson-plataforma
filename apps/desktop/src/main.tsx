import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/workspace.css";
import "./styles/design-tokens.css";

// Janela de aplicativo: sem o menu de navegador (Voltar, Salvar como, Imprimir). Campos de texto mantêm o menu de copiar e colar.
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable=\"true\"]")) return;
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
