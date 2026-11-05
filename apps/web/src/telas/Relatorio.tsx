import { useState } from "react";
import type { ReportModel, ReportSection } from "@nupe/core";
import { REPORT_STYLE, renderWordDocument } from "@nupe/core";
import { api, ApiError } from "../lib/http";
import { carregar, type ReportView } from "../lib/dados";
import { useDados } from "../lib/useDados";
import { Carregando, Falha } from "../componentes/comuns";
import { dataHora } from "../lib/formato";

export function Relatorio() {
  const rel = useDados<ReportView>(carregar.report);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function baixarWord(model: ReportModel) {
    const html = renderWordDocument(model);
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-nupe-${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function abrirPdf() {
    window.open("/api/report/document", "_blank", "noopener");
  }

  async function removerDemo() {
    setOcupado(true);
    setAviso("");
    try {
      await api.post("/api/demo/clear", {});
      setAviso("Dados fictícios removidos. As fichas e as respostas reais não foram alteradas.");
      await rel.recarregar();
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : "Não foi possível remover os dados fictícios.");
    } finally {
      setOcupado(false);
    }
  }

  if (rel.fase === "carregando") return <Carregando texto="Montando o relatório…" />;
  if (rel.fase === "erro") return <Falha texto={rel.erro} aoTentar={rel.recarregar} />;

  const model = rel.dados.report;
  const faltam = model.missing.length;

  return (
    <div className="relatorio-tela">
      <div className="rel-topo nao-imprime">
        <div className="rel-topo-esq">
          <h1 className="titulo" style={{ fontSize: 22 }}>
            Relatório de diagnóstico
          </h1>
          <p className="micro">
            Montado a partir das fichas e das respostas · {dataHora(model.generatedAt)}
          </p>
        </div>
        <div className="acoes">
          <button type="button" className="btn sutil" onClick={() => void rel.recarregar()} disabled={ocupado}>
            Atualizar
          </button>
          <button type="button" className="btn" onClick={() => baixarWord(model)}>
            Baixar Word
          </button>
          <button type="button" className="btn primario" onClick={abrirPdf}>
            Gerar PDF
          </button>
        </div>
      </div>

      {aviso ? (
        <p className="salvo" role="status">
          {aviso}
        </p>
      ) : null}

      <div className="fita-dados" aria-label="Estado do relatório">
        <div>
          <span className="micro">Fichas com pendência</span>
          <strong className={faltam ? "pend" : ""}>
            {contagem(model)}
            <small> de 8</small>
          </strong>
        </div>
        <div>
          <span className="micro">A preencher</span>
          <strong className={faltam ? "pend" : ""}>{faltam}</strong>
        </div>
        <div>
          <span className="micro">Seções</span>
          <strong>{model.sections.length}</strong>
        </div>
        <div>
          <span className="micro">Ações sugeridas</span>
          <strong>{model.nextSteps.filter((s) => s.action !== "[preencher]").length}</strong>
        </div>
      </div>

      {faltam ? (
        <details className="pendentes nao-imprime" open={faltam <= 12}>
          <summary>
            {faltam} {faltam === 1 ? "campo" : "campos"} ainda como [preencher]. O relatório sai com essa marcação, nunca
            com dado inventado.
          </summary>
          <ul>
            {model.missing.slice(0, 80).map((m, i) => (
              <li key={i}>
                <span>{m.where}</span>
                <span className="meta">{m.field}</span>
              </li>
            ))}
          </ul>
          {model.missing.length > 80 ? <p className="micro">E mais {model.missing.length - 80} campo(s).</p> : null}
        </details>
      ) : null}

      <article className="rel-doc" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <style>{REPORT_STYLE}</style>
        <header className="rel-capa">
          <p className="micro" style={{ fontFamily: "var(--font)" }}>
            UNEB · Campus XXI · DCHT XXI · Ipiaú
          </p>
          <h2>{model.title}</h2>
          <p className="sub">{model.subtitle}</p>
          <p className="meta">
            Gerado em {dataHora(model.generatedAt)} ·{" "}
            {model.status === "completo"
              ? "todas as fichas preenchidas"
              : `incompleto: ${faltam} ${faltam === 1 ? "campo" : "campos"} a preencher`}
          </p>
        </header>

        <nav className="sumario nao-imprime" aria-label="Sumário do relatório">
          <p className="micro">Sumário</p>
          {/* Os títulos já trazem o próprio número; a lista não numera de novo. */}
          <ol role="list">
            {model.sections.map((s) => (
              <li key={s.id}>
                <a href={`#sec-${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {model.sections.map((s) => (
          <Secao key={s.id} s={s} />
        ))}

        <footer className="rel-pe">
          <p className="micro">
            Documento gerado pelo sistema do NUPE. As contagens vêm das respostas recebidas; as fichas, do que foi registrado
            pelo estagiário. Campos não preenchidos aparecem como [preencher].
          </p>
        </footer>
      </article>

      <section className="painel nao-imprime" style={{ marginTop: 16 }}>
        <header>
          <h2 className="secao">Demonstração e exportação</h2>
        </header>
        <div className="duas-colunas">
          <div>
            <p className="legenda">
              Se a demonstração estiver carregada, as respostas fictícias entram no relatório e nas contagens. Este botão remove
              só elas; as fichas e as respostas reais ficam como estão.
            </p>
            <button type="button" className="btn perigo" style={{ marginTop: 10 }} disabled={ocupado} onClick={() => void removerDemo()}>
              Remover dados fictícios
            </button>
          </div>
          <div>
            <p className="legenda">
              “Baixar Word” gera um arquivo .doc que abre no Word, LibreOffice e Google Docs. “Gerar PDF” abre a versão de
              impressão: use Imprimir e escolha “Salvar como PDF”, papel A4.
            </p>
            <p className="micro" style={{ marginTop: 10 }}>
              Antes de entregar, confira os campos pendentes e a lista do item 9 do relatório.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Quantas das 8 fichas ainda têm campo marcado como [preencher]. As matrizes e
 * a amostra não contam: o indicador fala só do preenchimento das fichas.
 */
function contagem(model: ReportModel): number {
  const fichas = new Set<number>();
  for (const m of model.missing) {
    const achou = /^Ficha (\d)/.exec(m.where);
    if (achou) fichas.add(Number(achou[1]));
  }
  return fichas.size;
}

function Secao({ s }: { s: ReportSection }) {
  return (
    <section id={`sec-${s.id}`} className="rel-sec">
      <h2>{s.title}</h2>
      {s.paras.map((p, i) => (
        <div key={i} className={p.kind === "warn" ? "rel-aviso" : p.kind === "note" ? "rel-nota" : undefined}>
          <p>{p.text}</p>
          {p.evidence?.length ? (
            <p className="rel-ev">
              Evidência: {p.evidence.map((e) => e.label).join("; ")}
            </p>
          ) : null}
        </div>
      ))}
      {s.table ? (
        <div className="tabela-wrap">
          <table className="rel-tabela">
            {s.table.caption ? <caption>{s.table.caption}</caption> : null}
            <thead>
              <tr>
                {s.table.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.table.rows.length === 0 ? (
                <tr>
                  <td colSpan={s.table.head.length} className="rel-vazio">
                    Sem registros.
                  </td>
                </tr>
              ) : (
                s.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className={cell === "[preencher]" ? "rel-pend" : s.table!.priority?.[i] === "Alta" && j === 3 ? "rel-alta" : ""}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      {s.lists?.map((l, i) => (
        <div key={i}>
          <h3>{l.title}</h3>
          <ul className="rel-lista">
            {l.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

