import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  IconeColetas,
  IconeFichas,
  IconeMatrizes,
  IconePainel,
  IconeRelatorio,
  IconeResultados,
  Marca,
} from "./Icones";
import { aplicarTamanho, BarraTopo, BotoesTexto, tamanhoAtual, type Passo } from "./BarraTopo";
import { irPara } from "../lib/rotas";

export interface ItemNav {
  para: string;
  rotulo: string;
  icone: (p: { size?: number }) => ReactNode;
  nota?: string;
}

const PRINCIPAL: ItemNav[] = [
  { para: "/", rotulo: "Painel", icone: IconePainel },
  { para: "/coletas", rotulo: "Coletas", icone: IconeColetas },
  { para: "/resultados", rotulo: "Resultados", icone: IconeResultados },
];

const CAMPO: ItemNav[] = [
  { para: "/fichas/1", rotulo: "Fichas de campo", icone: IconeFichas },
  { para: "/matrizes", rotulo: "Matrizes", icone: IconeMatrizes },
  { para: "/relatorio", rotulo: "Relatório", icone: IconeRelatorio },
];

export function ehAtivo(atual: string, para: string): boolean {
  if (para === "/") return atual === "/";
  return atual === para || atual.startsWith(para + "/");
}

function NavLista({
  itens,
  atual,
  aoNavegar,
  notas,
}: {
  itens: ItemNav[];
  atual: string;
  aoNavegar: () => void;
  notas?: Record<string, string>;
}) {
  return itens.map((it) => {
    const ativo = ehAtivo(atual, it.para);
    const nota = notas?.[it.para];
    return (
      <a
        key={it.para}
        className="nav-item"
        href={it.para}
        aria-current={ativo ? "page" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          irPara(it.para);
          aoNavegar();
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          {it.icone({ size: 19 })}
          {it.rotulo}
        </span>
        {nota ? <span className="n">{nota}</span> : null}
      </a>
    );
  });
}

/* ---------- tamanho do texto ----------

   Três passos (normal, grande, maior) gravados no aparelho. A escala vive em
   <html data-texto>, onde os tokens trocam o tamanho do corpo inteiro. */

const CHAVE_TEXTO = "nupe-texto";

export function aplicarTextoSalvo() {
  if (typeof document === "undefined") return;
  let salvo: string | null = null;
  try {
    salvo = localStorage.getItem(CHAVE_TEXTO);
  } catch {
    salvo = null;
  }
  if (salvo && (salvo === "normal" || salvo === "grande" || salvo === "maior")) {
    if (salvo === "normal") delete document.documentElement.dataset.texto;
    else document.documentElement.dataset.texto = salvo;
  }
}

function ControleTexto() {
  const [passo, setPasso] = useState<Passo>(() => tamanhoAtual());

  function escolher(p: Passo) {
    setPasso(p);
    aplicarTamanho(p);
  }

  return (
    <div className="texto-controle">
      <span id="rotulo-texto">Tamanho do texto</span>
      <BotoesTexto passo={passo} aoEscolher={escolher} rotuloId="rotulo-texto" />
    </div>
  );
}

export function Moldura({
  atual,
  nome,
  notas,
  children,
  larguraTotal = false,
}: {
  atual: string;
  nome: string;
  notas?: Record<string, string>;
  children: ReactNode;
  larguraTotal?: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  const painelRef = useRef<HTMLElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setAberta(false);
    window.scrollTo({ top: 0 });
  }, [atual]);

  // O <main> não é focável na tabulação normal; com -1 ele recebe o foco do
  // atalho "Ir para o conteúdo" e o leitor de tela continua daqui.
  function focarConteudo(e: MouseEvent<HTMLAnchorElement>) {
    if (e.currentTarget.getAttribute("href") !== "#conteudo") return;
    e.preventDefault();
    mainRef.current?.focus();
    mainRef.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberta(false);
        botaoRef.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    painelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    // Fora do celular o menu é a barra lateral fixa: não há o que prender.
    const tela = window.matchMedia("(max-width: 860px)");
    if (tela.matches) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
    };
  }, [aberta]);

  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="app">
      <a className="skip" href="#conteudo" onClick={focarConteudo}>
        Ir para o conteúdo
      </a>
      <BarraTopo aberta={aberta} botaoRef={botaoRef} aoAlternarMenu={() => setAberta((v) => !v)} aoFechar={() => setAberta(false)} />

      <aside id="navegacao" ref={painelRef} className={"sidebar nao-imprime" + (aberta ? " aberta" : "")} aria-label="Navegação principal">
        <div className="marca">
          <Marca size={40} />
          <div>
            <div className="marca-nome">NUPE</div>
            <div className="marca-sub">Pesquisa e Extensão · UNEB XXI</div>
          </div>
        </div>
        <nav style={{ display: "grid", gap: 3 }}>
          <NavLista itens={PRINCIPAL} atual={atual} aoNavegar={() => setAberta(false)} notas={notas} />
          <div className="grupo">Campo e relatório</div>
          <NavLista itens={CAMPO} atual={atual} aoNavegar={() => setAberta(false)} notas={notas} />
        </nav>
        <div className="rodape-nav">
          <ControleTexto />
          <a
            className="nav-item"
            href="/ajustes"
            onClick={(e) => {
              e.preventDefault();
              irPara("/ajustes");
              setAberta(false);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="avatar" aria-hidden="true">
                {iniciais || "NU"}
              </span>
              <span className="nome-caixa">
                <strong>{nome}</strong>
                <span>Ajustes da conta</span>
              </span>
            </span>
          </a>
        </div>
      </aside>

      <main id="conteudo" ref={mainRef} tabIndex={-1} className="canvas">
        <div className={larguraTotal ? undefined : "coluna"}>{children}</div>
      </main>
      <nav className="nav-inferior nao-imprime" aria-label="Atalhos">
        {[PRINCIPAL[0]!, PRINCIPAL[1]!, PRINCIPAL[2]!, CAMPO[0]!, CAMPO[2]!].map((it) => (
          <a
            key={it.para}
            href={it.para}
            aria-current={ehAtivo(atual, it.para) ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              irPara(it.para);
            }}
          >
            {it.icone({ size: 22 })}
            {it.rotulo === "Fichas de campo" ? "Fichas" : it.rotulo}
          </a>
        ))}
      </nav>
    </div>
  );
}
