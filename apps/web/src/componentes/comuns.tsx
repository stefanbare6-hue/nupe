import type { ReactNode } from "react";
import { useId } from "react";

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p className="legenda" role="status" style={{ padding: "24px 0" }}>
      {texto}
    </p>
  );
}

export function Falha({ texto, aoTentar }: { texto: string; aoTentar?: () => void }) {
  return (
    <div className="aviso" role="alert" style={{ marginTop: 16 }}>
      <span>
        <b>Não foi possível carregar.</b> {texto}
      </span>
      {aoTentar ? (
        <button type="button" className="texto-link" onClick={aoTentar} style={{ marginLeft: "auto", flex: "none" }}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="aviso" role="note">
      <span>{children}</span>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}

export function Campo({
  rotulo,
  dica,
  children,
  htmlFor,
}: {
  rotulo: string;
  dica?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="campo">
      <label htmlFor={htmlFor}>{rotulo}</label>
      {dica ? <span className="dica">{dica}</span> : null}
      {children}
    </div>
  );
}

/** Campo de texto com rótulo oculto acc: usado nas fichas, onde o cabeçalho é o título. */
export function Celula({
  valor,
  aoMudar,
  aoSair,
  rotulo,
  tipo = "text",
  placeholder,
  multilinha,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  aoSair?: () => void;
  rotulo: string;
  tipo?: "text" | "date" | "number";
  placeholder?: string;
  multilinha?: boolean;
}) {
  const id = useId();
  if (multilinha) {
    return (
      <textarea
        id={id}
        className="input"
        aria-label={rotulo}
        value={valor}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        onBlur={aoSair}
      />
    );
  }
  return (
    <input
      id={id}
      className="input"
      type={tipo}
      aria-label={rotulo}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => aoMudar(e.target.value)}
      onBlur={aoSair}
    />
  );
}

/** Espera `ms` após a última chamada antes de executar `fn`. */
export function atrasado(fn: () => void, ms = 500) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(), ms);
  };
}
