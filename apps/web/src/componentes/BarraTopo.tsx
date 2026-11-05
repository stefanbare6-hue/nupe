/** Barra do topo: marca à esquerda, menu à direita no celular.
 *
 *  A mesma barra aparece no painel e no questionário público, para as duas
 *  telas parecerem o mesmo sistema. No painel, à direita do menu, entram os
 *  três passos de tamanho do texto. No questionário, que é aberto por quem
 *  responde, entra só o link para a área da estagiária. */
import type { RefObject } from "react";
import { IconeFechar, IconeMenu, Marca } from "./Icones";

export const CHAVE_TEXTO = "nupe-texto";
export type Passo = "normal" | "grande" | "maior";
export const PASSOS: Array<{ id: Passo; rotulo: string; letra: string }> = [
  { id: "normal", rotulo: "Tamanho do texto: normal", letra: "A" },
  { id: "grande", rotulo: "Tamanho do texto: grande", letra: "A+" },
  { id: "maior", rotulo: "Tamanho do texto: muito grande", letra: "A++" },
];

/** Aplica no <html> o tamanho salvo. Roda antes da interface aparecer. */
export function aplicarTextoSalvo() {
  if (typeof document === "undefined") return;
  let salvo: string | null = null;
  try {
    salvo = localStorage.getItem(CHAVE_TEXTO);
  } catch {
    salvo = null;
  }
  if (salvo && PASSOS.some((p) => p.id === salvo)) document.documentElement.dataset.texto = salvo;
}

export function tamanhoAtual(): Passo {
  if (typeof document === "undefined") return "normal";
  const atual = document.documentElement.dataset.texto;
  return atual === "grande" || atual === "maior" ? atual : "normal";
}

/** Troca o tamanho e grava no aparelho. */
export function aplicarTamanho(p: Passo) {
  if (typeof document === "undefined") return;
  if (p === "normal") delete document.documentElement.dataset.texto;
  else document.documentElement.dataset.texto = p;
  try {
    localStorage.setItem(CHAVE_TEXTO, p);
  } catch {
    /* navegador sem armazenamento: vale só nesta visita */
  }
}

export function BotoesTexto({
  passo,
  aoEscolher,
  rotuloId,
}: {
  passo: Passo;
  aoEscolher: (p: Passo) => void;
  rotuloId: string;
}) {
  return (
    <span className="grupo-botoes" role="group" aria-labelledby={rotuloId}>
      {PASSOS.map((p) => (
        <button key={p.id} type="button" aria-pressed={passo === p.id} aria-label={p.rotulo} onClick={() => aoEscolher(p.id)}>
          {p.letra}
        </button>
      ))}
    </span>
  );
}

export function BarraTopo({
  aberta,
  botaoRef,
  aoAlternarMenu,
  aoFechar,
  lado,
}: {
  aberta: boolean;
  botaoRef?: RefObject<HTMLButtonElement | null>;
  aoAlternarMenu: () => void;
  aoFechar: () => void;
  lado?: React.ReactNode;
}) {
  return (
    <header className="barra-topo nao-imprime">
      {aberta ? <button type="button" className="barra-fundo" aria-label="Fechar menu" onClick={aoFechar} /> : null}
      <div className="barra-topo-linha">
        <span className="tela">
          <Marca size={30} />
          NUPE
        </span>
        <div className="barra-direita">
          {lado}
          <button
            ref={botaoRef}
            id="abrir-menu"
            className="btn sutil menu-botao"
            type="button"
            aria-expanded={aberta}
            aria-controls="navegacao"
            onClick={aoAlternarMenu}
          >
            {aberta ? <IconeFechar /> : <IconeMenu />}
            {aberta ? "Fechar" : "Menu"}
          </button>
        </div>
      </div>
    </header>
  );
}
