import type { KeyboardEvent } from "react";
import type { QuestionResult } from "@nupe/core";
import { decimal, numero, percentual } from "../lib/formato";

/**
 * Cada pergunta decide sozinha se pode mostrar percentual (amostra mínima de 5
 * respostas àquela pergunta). Por isso os gráficos leem `q.showPercent`.
 */
export function PerguntaResultado({ q, showPercent }: { q: QuestionResult; showPercent: boolean }) {
  const comPercentual = showPercent && q.showPercent;
  return (
    <article className="resultado-pergunta">
      <header>
        <div className="pergunta-topo">
          <h3 className="secao">
            <span className="pergunta-num" aria-hidden="true">
              {q.number}
            </span>
            <span className="visualmente-oculto">{`Pergunta ${q.number}: `}</span>
            {q.text}
          </h3>
        </div>
        <p className="micro" id={`r-${q.questionId}-meta`}>
          {q.answered === 0
            ? "sem respostas"
            : `${numero(q.answered)} ${q.answered === 1 ? "resposta" : "respostas"} de ${numero(q.total)} ${q.total === 1 ? "recebida" : "recebidas"}`}
          {showPercent && !q.showPercent && q.answered > 0 ? " · esta pergunta tem amostra pequena, só contagens" : ""}
          {!showPercent ? " · amostra pequena, só contagens" : ""}
        </p>
      </header>

      {q.type === "scale" && q.scale ? <Escala q={q} showPercent={comPercentual} /> : null}

      {(q.type === "single" || q.type === "multi") && q.options.length ? (
        <div className="barras">
          {q.options.map((o) => {
            const base = comPercentual ? q.answered : Math.max(1, ...q.options.map((x) => x.count));
            const largura = o.count === 0 ? 0 : Math.max(2, Math.round((o.count / base) * 100));
            return (
              <div key={o.code} className={"barra-linha" + (o.count === 0 ? " zera" : "")}>
                <div className="barra-rotulo">
                  <span>{o.label}</span>
                </div>
                <span className="barra-valor">
                  {numero(o.count)}
                  {comPercentual && o.percent !== null ? <span className="meta"> · {percentual(o.percent)}</span> : null}
                </span>
                <div className="barra-trilho" aria-hidden="true">
                  <div className="barra-preenchida" style={{ width: `${largura}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {q.type === "open" ? (
        <p className="legenda">
          As respostas abertas aparecem abaixo, agrupadas por tema, com o texto original.
        </p>
      ) : null}
    </article>
  );
}

function Escala({ q, showPercent }: { q: QuestionResult; showPercent: boolean }) {
  const dist = q.scale!.distribution;
  const max = Math.max(1, ...dist.map((d) => d.count));
  return (
    <div className="escala-resultado">
      <div className="escala-numeros">
        <div>
          <span className="kpi-label">Média</span>
          <span className="escala-valor num">{decimal(q.scale!.mean)}</span>
          <span className="meta"> de 5</span>
        </div>
        <div>
          <span className="kpi-label">Mediana</span>
          <span className="escala-valor num">{decimal(q.scale!.median)}</span>
        </div>
      </div>
      <div
        className="escala-grafico"
        role="img"
        aria-label={`Distribuição das notas de 1 a 5: ${dist.map((d) => `nota ${d.value}, ${d.count} ${d.count === 1 ? "resposta" : "respostas"}`).join("; ")}`}
      >
        <div className="escala-eixo-y" aria-hidden="true">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="colunas">
          {dist.map((d) => (
            <div key={d.value} className="coluna-barra">
              <span className="rotulo">
                {numero(d.count)}
                {showPercent && d.percent !== null ? <span className="meta"> · {percentual(d.percent)}</span> : null}
              </span>
              <div
                className="barra"
                style={{
                  height: `${Math.round((d.count / max) * 100)}%`,
                  opacity: q.scale!.median !== null && d.value <= q.scale!.median ? 1 : 0.55,
                }}
              />
              <span className="rotulo nota">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="micro" style={{ maxWidth: "42ch" }}>
        A média descreve só quem respondeu ({numero(q.answered)}); as barras cheias vão até a mediana.
      </p>
    </div>
  );
}

function setaAba(lista: string[], atual: string, para: number): string {
  const i = lista.indexOf(atual);
  const n = lista.length;
  return lista[(((i < 0 ? 0 : i) + para) % n + n) % n]!;
}

export function AbasPublico({
  audiencias,
  atual,
  aoMudar,
}: {
  audiencias: Array<{ id: string; rotulo: string; total: number }>;
  atual: string;
  aoMudar: (id: string) => void;
}) {
  const ids = audiencias.map((a) => a.id);
  // Setas trocam de público, como manda o padrão de abas; o Tab normal anda página afora.
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? setaAba(ids, atual, 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? setaAba(ids, atual, -1)
          : e.key === "Home"
            ? ids[0]
            : e.key === "End"
              ? ids[ids.length - 1]
              : undefined;
    if (!destino) return;
    e.preventDefault();
    aoMudar(destino);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-publico="${destino}"]`)?.focus();
  }

  return (
    <div className="segmentado" role="tablist" aria-label="Público" onKeyDown={aoTeclar}>
      {audiencias.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          data-publico={a.id}
          aria-selected={a.id === atual}
          tabIndex={a.id === atual ? 0 : -1}
          onClick={() => aoMudar(a.id)}
        >
          {a.rotulo} <span className="meta num">{numero(a.total)}</span>
        </button>
      ))}
    </div>
  );
}
