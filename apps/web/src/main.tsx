import { createRoot } from "react-dom/client";
import { App } from "./App";
import { aplicarTextoSalvo } from "./componentes/Moldura";
import "./estilo/tokens.css";
import "./estilo/base.css";
import "./estilo/painel.css";
import "./estilo/questionario.css";
import "./estilo/fichas.css";
import "./estilo/relatorio.css";

// O tamanho de texto escolhido no menu vale antes da primeira pintura.
aplicarTextoSalvo();

createRoot(document.getElementById("raiz")!).render(<App />);
