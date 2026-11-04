import { useState } from "react";
import { publicoNaFrase, type Audience } from "@nupe/core";
import { carregar, type ResultsView, type ThemeFull } from "../lib/dados";
import { api, ApiError } from "../lib/http";
import { useDados } from "../lib/useDados";
import { numero, rotuloPublico } from "../lib/formato";
import { irPara } from "../lib/rotas";
import { AbasPublico, PerguntaResultado } from "../componentes/Graficos";
import { Carregando, Falha, Vazio, Aviso } from "../componentes/comuns";
import { IconeDocumento, IconeGrupo, IconePublico } from "../componentes/Icones";

const PUBLICOS: Audience[] = ["estudantes", "docentes", "equipe"];

export function Resultados({ audienciaInicial = "estudantes" }: { audienciaInicial?: string }) {
  const [publico, setPublico] = useState<Audience>((PUBLICOS as string[]).includes(audienciaInicial) ? (audienciaInicial as Audience) : "estudantes");
  const resultados = useDados<ResultsView>(() => carregar.results(publico), [publico]);
  const totais = resultados.dados?.totals ?? {};
  const temas = useDados<{ themes: ThemeFull[] }>(carregar.themes);
  const [salvandoTema, setSalvandoTema] = useState<string | null>(null);
  const [erroTema, setErroTema] = useState("");

  const total = resultados.dados?.summary.total ?? totais[publico] ?? 0;
  const valoresTotais = { ...totais, ...(resultados.dados?.totals ?? {}), [publico]: total };
  // Público que já tem respostas, para oferecer o atalho quando a aba aberta está vazia.
  const comDados = PUBLICOS.find((p) => p !== publico && (valoresTotais[p] ?? 0) > 0);

  async function trocarTema(respostaId: string, themeId: string | null) {
    setSalvandoTema(respostaId);
    setErroTema("");
    try {
      await api.put(`/api/open-responses/${respostaId}/theme`, { themeId });
      await resultados.recarregar();
    } catch (e) {
      setErroTema(e instanceof ApiError ? e.message : "Não foi possível salvar o tema.");
    } finally {
      setSalvandoTema(null);
    }
  }

  const porPergunta = new Map<string, ResultsView["openResponses"]>();
  for (const r of resultados.dados?.openResponses ?? []) {
    const lista = porPergunta.get(r.questionId) ?? [];
    lista.push(r);
    porPergunta.set(r.questionId, lista);
  }
  const semTema = (resultados.dados?.openResponses ?? []).filter((r) => r.themeIds.length === 0 && !r.manual).length;

  return (
    <>
      <div className="cabeca">
        <div>
          <h1 className="titulo">Resultados</h1>
          <p className="sub">
            Contagem de todas as respostas válidas do público. Percentuais e médias só aparecem com pelo menos 5 respostas.
          </p>
        </div>
        <div className="acoes">
          <button type="button" className="btn" onClick={() => irPara("/relatorio")}>
            <IconeDocumento size={17} />
            Ir ao relatório
          </button>
        </div>
      </div>

      <div className="filtros">
        <AbasPublico
          atual={publico}
          audiencias={PUBLICOS.map((p) => ({ id: p, rotulo: rotuloPublico(p), total: valoresTotais[p] ?? 0 }))}
          aoMudar={(id) => setPublico(id as Audience)}
        />
      </div>

      {resultados.fase === "carregando" ? <Carregando /> : null}
      {resultados.fase === "erro" ? <Falha texto={resultados.erro} aoTentar={resultados.recarregar} /> : null}

      {resultados.fase === "pronto" ? (
        resultados.dados.summary.total === 0 ? (
          <Vazio>
            Nenhuma resposta {publicoNaFrase(publico)} recebida até agora. Divulgue o link da coleta em{" "}
            <a
              className="texto-link"
              href="/coletas"
              onClick={(e) => {
                e.preventDefault();
                irPara("/coletas");
              }}
            >
              Coletas
            </a>
            .
            {comDados ? (
              <span>
                {" "}
                Já há respostas {publicoNaFrase(comDados)}.{" "}
                <button type="button" className="texto-link" onClick={() => setPublico(comDados)}>
                  Ver resultados {publicoNaFrase(comDados)}
                </button>
                .
              </span>
            ) : null}
          </Vazio>
        ) : (
          <>
            {!resultados.dados.summary.showPercent ? (
              <Aviso>
                <b>Amostra pequena.</b> Com {numero(resultados.dados.summary.total)} resposta(s), o percentual seria enganoso. O
                painel mostra apenas contagens; médias e percentuais aparecem a partir de 5 respostas.
              </Aviso>
            ) : null}

            <div className="grade-principal">
              <div className="pilha">
                {resultados.dados.summary.questions.map((q) => (
                  <section key={q.questionId} className="painel">
                    <PerguntaResultado q={q} showPercent={resultados.dados!.summary.showPercent} />
                    {q.type === "open" ? (
                      <RespostasAbertas
                        respostas={porPergunta.get(q.questionId) ?? []}
                        temas={temas.dados?.themes ?? []}
                        aoTrocar={trocarTema}
                        salvando={salvandoTema}
                      />
                    ) : null}
                  </section>
                ))}
              </div>

              <aside className="pilha" aria-label="Amostra, temas e leitura">
                <section className="painel">
                  <div className="amostra-cab">
                    <span className="icone-circulo">
                      <IconePublico publico={publico} size={24} />
                    </span>
                    <h2 className="secao">Amostra de {rotuloPublico(publico)}</h2>
                  </div>
                  <div className="amostra-num num">{numero(resultados.dados.summary.total)}</div>
                  <p className="micro">
                    {resultados.dados.summary.showPercent
                      ? "Percentuais exibidos como referência das respostas recebidas, não da população."
                      : "Não há percentuais com menos de 5 respostas."}
                  </p>
                </section>

                <section className="painel">
                  <header className="secao-cab">
                    <h2 className="secao">Temas das respostas abertas</h2>
                  </header>
                  {resultados.dados.themes.filter((t) => t.count > 0).length === 0 ? (
                    <p className="legenda">Nenhuma resposta aberta classificada.</p>
                  ) : (
                    <div className="linhas">
                      {resultados.dados.themes
                        .filter((t) => t.count > 0)
                        .map((t) => (
                          <div className="linha" key={t.label}>
                            <span>{t.label}</span>
                            <span className="num contagem-tema">{numero(t.count)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                  {semTema > 0 ? (
                    <p className="micro" style={{ marginTop: 12 }}>
                      {numero(semTema)} resposta(s) sem tema. Abra a pergunta e ajuste o tema quando o assunto existir na lista.
                    </p>
                  ) : null}
                </section>

                <section className="painel painel-dica">
                  <div className="painel-dica-cab">
                    <span className="icone-circulo claro">
                      <IconeGrupo size={22} />
                    </span>
                    <h2 className="secao">Como ler</h2>
                  </div>
                  <p className="legenda" style={{ marginTop: 10 }}>
                    Em perguntas de múltipla escolha, o percentual é de quem marcou a opção, então a soma passa de 100%. Em
                    escalas, a média descreve só quem respondeu.
                  </p>
                </section>
              </aside>
            </div>
          </>
        )
      ) : null}
      {erroTema ? (
        <p className="erro-texto" role="alert">
          {erroTema}
        </p>
      ) : null}
      {temas.fase === "erro" ? <p className="micro">Não foi possível carregar a lista de temas.</p> : null}
    </>
  );
}

function RespostasAbertas({
  respostas,
  temas,
  aoTrocar,
  salvando,
}: {
  respostas: ResultsView["openResponses"];
  temas: ThemeFull[];
  aoTrocar: (id: string, tema: string | null) => void;
  salvando: string | null;
}) {
  if (respostas.length === 0) return <p className="meta">Nenhuma resposta escrita nesta pergunta.</p>;
  const grupos = new Map<string, ResultsView["openResponses"]>();
  for (const r of respostas) {
    const chave = r.themeIds[0] ?? "sem-tema";
    grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
  }
  return (
    <div className="grupo-aberto" style={{ marginTop: 14 }}>
      {[...grupos.entries()].map(([id, lista]) => (
        <details key={id} open={grupos.size <= 3}>
          <summary>
            <span>{id === "sem-tema" ? "Sem tema definido" : (temas.find((t) => t.id === id)?.label ?? id)}</span>
            <span className="meta num">
              {lista.length} {lista.length === 1 ? "resposta" : "respostas"}
            </span>
          </summary>
          <ul>
            {lista.map((r) => (
              <li key={r.id}>
                <blockquote>{r.text}</blockquote>
                <label className="tema-escolha">
                  <span className="micro">Tema</span>
                  <select
                    className="input"
                    value={r.themeIds[0] ?? ""}
                    disabled={salvando === r.id}
                    onChange={(e) => aoTrocar(r.id, e.target.value || null)}
                  >
                    <option value="">Sem tema</option>
                    {temas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {salvando === r.id ? <span className="micro">salvando…</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
