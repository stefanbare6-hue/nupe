import { useEffect, useRef, useState } from "react";

/** Janela de confirmação dentro da própria tela, no lugar do confirm() do navegador. */
export function Confirmar({
  rotulo,
  pergunta,
  acoes,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  /** Nome do que está sendo confirmado, para leitores de tela. */
  rotulo: string;
  pergunta: string;
  /** Texto dos dois botões: [confirmar, cancelar]. */
  acoes: [string, string];
  ocupado?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caixa.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoCancelar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoCancelar]);

  return (
    <div className="confirmar" role="group" aria-label={rotulo} ref={caixa}>
      <p className="legenda" style={{ fontSize: "var(--fs-small)" }}>
        {pergunta}
      </p>
      <div className="confirmar-botoes">
        <button type="button" className="btn primario" onClick={aoConfirmar} disabled={ocupado}>
          {acoes[0]}
        </button>
        <button type="button" className="btn" onClick={aoCancelar} disabled={ocupado}>
          {acoes[1]}
        </button>
      </div>
    </div>
  );
}

/** Botão que troca o clique por uma confirmação em linha (sem janela do navegador). */
export function BotaoConfirmavel({
  rotulo,
  pergunta,
  acoes = ["Confirmar", "Cancelar"],
  variante = "btn",
  ocupado,
  aoConfirmar,
  children,
}: {
  rotulo: string;
  pergunta: string;
  acoes?: [string, string];
  variante?: string;
  ocupado?: boolean;
  aoConfirmar: () => void;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const cancelar = () => setAberto(false);
  if (aberto) {
    return (
      <Confirmar
        rotulo={rotulo}
        pergunta={pergunta}
        acoes={acoes}
        ocupado={ocupado}
        aoConfirmar={() => {
          setAberto(false);
          aoConfirmar();
        }}
        aoCancelar={cancelar}
      />
    );
  }
  return (
    <button type="button" className={variante} disabled={ocupado} onClick={() => setAberto(true)} aria-label={rotulo}>
      {children}
    </button>
  );
}
