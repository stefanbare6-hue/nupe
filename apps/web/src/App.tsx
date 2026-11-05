import { useEffect } from "react";
import { useRota, segmentos, irPara } from "./lib/rotas";
import { verificarConfiguracao } from "./lib/sessao";
import { AreaInterna } from "./componentes/AreaInterna";
import { Configurar, Entrar } from "./telas/Acesso";
import { QuestionarioPublico } from "./telas/Questionario";
import { Coletas, Painel } from "./telas/Painel";
import { Resultados } from "./telas/Resultados";
import { Ficha, FICHAS } from "./telas/Fichas";
import { Matrizes } from "./telas/Matrizes";
import { Relatorio } from "./telas/Relatorio";
import { Ajustes } from "./telas/Ajustes";
import { Titulo } from "./lib/sessao";

function SemRota() {
  Titulo("Página não encontrada");
  return (
    <main className="tela-aberta">
      <div className="cartao-adm">
        <h1 className="titulo">Página não encontrada</h1>
        <p className="legenda" style={{ marginTop: 8 }}>
          O endereço não existe. Volte ao{" "}
          <a className="texto-link" href="/" onClick={(e) => { e.preventDefault(); irPara("/"); }}>
            painel
          </a>
          .
        </p>
      </div>
    </main>
  );
}

export function App() {
  const rota = useRota();
  const seg = segmentos(rota);

  // Primeira visita: sem administrador, a configuração vem antes de tudo.
  useEffect(() => {
    if (seg[0] === "e" || seg[0] === "configurar" || seg[0] === "entrar") return;
    void verificarConfiguracao().then((precisa) => {
      if (precisa) irPara("/configurar", true);
    });
  }, [seg[0]]);

  // Questionário público: rota própria, sem a moldura interna.
  if (seg[0] === "e" && seg[1]) return <QuestionarioPublico publicId={seg[1]} />;
  if (seg[0] === "configurar") return <Configurar />;
  if (seg[0] === "entrar") return <Entrar rota={rota} />;

  if (seg.length === 0)
    return (
      <AreaInterna atual="/" titulo="Painel">
        {() => <Painel />}
      </AreaInterna>
    );

  if (seg[0] === "coletas")
    return (
      <AreaInterna atual="/coletas" titulo="Coletas">
        {() => <Coletas />}
      </AreaInterna>
    );

  if (seg[0] === "resultados")
    return (
      <AreaInterna atual="/resultados" titulo="Resultados">
        {() => <Resultados audienciaInicial={seg[1]} />}
      </AreaInterna>
    );

  if (seg[0] === "fichas") {
    const numero = seg[1] ?? "1";
    const info = FICHAS.find((f) => f.rota === numero);
    if (!info) return <SemRota />;
    return (
      <AreaInterna atual={`/fichas/${numero}`} titulo={`Ficha ${info.n} · ${info.titulo}`}>
        {() => <Ficha numero={info.rota} />}
      </AreaInterna>
    );
  }

  if (seg[0] === "matrizes")
    return (
      <AreaInterna atual="/matrizes" titulo="Matrizes">
        {() => <Matrizes />}
      </AreaInterna>
    );

  if (seg[0] === "relatorio")
    return (
      <AreaInterna atual="/relatorio" titulo="Relatório" larguraTotal>
        {() => <Relatorio />}
      </AreaInterna>
    );

  if (seg[0] === "ajustes")
    return (
      <AreaInterna atual="/ajustes" titulo="Ajustes">
        {(me) => <Ajustes me={me} />}
      </AreaInterna>
    );

  return <SemRota />;
}
