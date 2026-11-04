import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { carregar, type MeView } from "../lib/dados";
import { ApiError } from "../lib/http";
import { Titulo } from "../lib/sessao";
import { irPara } from "../lib/rotas";
import { Moldura } from "./Moldura";
import { Carregando } from "./comuns";

/** Área do estagiário: exige sessão; sem sessão, leva ao acesso. */
export function AreaInterna({
  atual,
  titulo,
  notas,
  children,
  larguraTotal,
}: {
  atual: string;
  titulo: string;
  notas?: Record<string, string>;
  children: (me: MeView) => ReactNode;
  larguraTotal?: boolean;
}) {
  Titulo(titulo);
  const [me, setMe] = useState<MeView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    carregar
      .me()
      .then((m) => vivo && setMe(m))
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof ApiError && e.status === 401) {
          irPara(`/entrar?sair=${encodeURIComponent(atual)}`, true);
        } else {
          setErro(e instanceof Error ? e.message : "Falha de conexão.");
        }
      });
    return () => {
      vivo = false;
    };
  }, [atual]);

  if (erro) {
    return (
      <main className="canvas" style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="titulo">Painel indisponível</h1>
        <p className="legenda" style={{ marginTop: 8 }}>
          {erro} Verifique se o servidor está em execução e recarregue a página.
        </p>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="canvas" style={{ maxWidth: 720, margin: "0 auto" }}>
        <Carregando />
      </main>
    );
  }
  return (
    <Moldura atual={atual} nome={me.name} notas={notas} larguraTotal={larguraTotal}>
      {children(me)}
    </Moldura>
  );
}
