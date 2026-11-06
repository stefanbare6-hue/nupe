import { useCallback, useState } from "react";
import { api, ApiError } from "../lib/http";
import { prazo, rotuloPublico, dataCurta, numero } from "../lib/formato";
import { irPara } from "../lib/rotas";
import { Carregando, Falha, Vazio } from "../componentes/comuns";
import { BotaoConfirmavel, Confirmar } from "../componentes/Confirmar";
import {
  IconeAlerta,
  IconeCalendario,
  IconeCheck,
  IconeDocumento,
  IconeLink,
  IconePublico,
  IconeSeta,
} from "../componentes/Icones";
import { useDados } from "../lib/useDados";
import { carregar, discoDescartavel, type DashboardView } from "../lib/dados";
import { publicoNaFrase, type Collection } from "@nupe/core";

const STATUS: Record<Collection["status"], string> = {
  rascunho: "Rascunho",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

function classeEstado(status: Collection["status"]) {
  return "estado " + (status === "aberta" ? "ok" : status === "encerrada" ? "off" : "pend");
}

function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  const [foco, setFoco] = useState(false);
  const completo = `${window.location.origin}${link}`;
  // Na tela cabe só o começo do código da coleta, que já distingue um link do
  // outro. Em foco aparece o caminho inteiro; o botão copia o endereço completo.
  const codigo = link.split("/").pop() ?? "";
  const visivel = foco ? completo : `/e/${codigo}`;
  return (
    <div className="link-linha">
      <input
        className="input"
        readOnly
        value={visivel}
        title={completo}
        aria-label="Link do questionário"
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onClick={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(completo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
      >
        {copiado ? <IconeCheck size={16} /> : <IconeLink size={16} />}
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function LinkPublico({ collection, aoAtualizar }: { collection: Collection; aoAtualizar: () => void }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const cancelar = useCallback(() => setConfirmar(false), []);
  if (!collection.publicId || collection.status === "rascunho") return null;
  return (
    <div className="painel-link">
      <span className="micro" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <IconeLink size={14} /> Link do questionário
      </span>
      <LinkCopiavel link={`/e/${collection.publicId}`} />
      {confirmar ? (
        <Confirmar
          rotulo="Gerar novo link"
          pergunta="O link atual deixa de funcionar na hora. Confirmar novo link?"
          acoes={["Gerar novo", "Cancelar"]}
          ocupado={ocupado}
          aoCancelar={cancelar}
          aoConfirmar={async () => {
            setOcupado(true);
            try {
              await api.post(`/api/collections/${collection.id}/rotate-link`);
              // Relê o painel para mostrar o link novo, sem recarregar a página.
              await aoAtualizar();
            } catch (e) {
              setErro(e instanceof ApiError ? e.message : "Não foi possível gerar o link.");
              setOcupado(false);
              setConfirmar(false);
            }
          }}
        />
      ) : (
        <button type="button" className="texto-link" onClick={() => setConfirmar(true)}>
          Gerar novo link
        </button>
      )}
      {erro ? (
        <p className="erro-texto" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export function Coletas() {
  const { fase, dados, erro, recarregar } = useDados<DashboardView>(carregar.dashboard);
  const [mensagem, setMensagem] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [avisoLinks, setAvisoLinks] = useState("");

  const atualizar = useCallback(
    async (c: Collection, corpo: Record<string, unknown>, fala: string) => {
      setOcupado(c.id);
      setErroAcao("");
      try {
        await api.patch(`/api/collections/${c.id}`, corpo);
        setMensagem(fala);
        await recarregar();
      } catch (e) {
        setErroAcao(e instanceof ApiError ? e.message : "Não foi possível atualizar a coleta.");
      } finally {
        setOcupado(null);
      }
    },
    [recarregar],
  );

  const reais = dados?.collections.filter((c) => !c.demo) ?? [];
  // Todos os públicos aparecem sempre, em qualquer estado. Uma coleta encerrada
  // precisa continuar na lista para o botão "Reabrir coleta" existir.
  const abertas = reais;
  const demo = dados?.collections.filter((c) => c.demo) ?? [];
  const recebidas = (dados?.counts ?? []).reduce((s, c) => s + c.total, 0);
  const comPrazo = reais.filter((c) => c.closesAt && c.status === "aberta").length;

  return (
    <>
      <div className="cabeca">
        <div>
          <h1 className="titulo">Coletas</h1>
          <p className="sub">
            Cada público tem um questionário com link próprio. Abra a coleta quando o link já puder circular e encerre para
            fechar o recebimento.
          </p>
        </div>
        <div className="acoes">
          <button
            type="button"
            className="btn primario"
            disabled={copiando}
            onClick={async () => {
              setCopiando(true);
              setAvisoLinks("");
              try {
                const d = await api.get<{ links: Record<string, string | null> }>("/api/collections/links");
                const prontos = Object.entries(d.links).filter((par): par is [string, string] => Boolean(par[1]));
                if (prontos.length === 0) {
                  setAvisoLinks("Nenhuma coleta está aberta. Abra a coleta para o link ser criado.");
                  return;
                }
                const linhas = prontos
                  .map(([p, link]) => `${rotuloPublico(p)}: ${window.location.origin}${link}`)
                  .join("\n");
                await navigator.clipboard.writeText(linhas);
                setAvisoLinks(
                  prontos.length === 1
                    ? "Link copiado. Cada linha traz o público e o endereço completo."
                    : "Links copiados. Cada linha traz o público e o endereço completo.",
                );
              } catch {
                setAvisoLinks("Não foi possível copiar. Copie pelo campo de cada coleta.");
              } finally {
                setCopiando(false);
              }
            }}
          >
            <IconeLink size={17} />
            Copiar links abertos
          </button>
        </div>
      </div>

      {dados ? (
        <section className="kpis" aria-label="Resumo das coletas">
          <div className="kpi">
            <span className="kpi-icone" aria-hidden="true">
              <IconePublico publico="grupo" size={24} />
            </span>
            <div>
              <div className="kpi-value">{reais.filter((c) => c.status === "aberta").length}</div>
              <div className="kpi-label">coletas abertas</div>
            </div>
          </div>
          <div className="kpi">
            <span className="kpi-icone" aria-hidden="true">
              <IconeCheck size={26} />
            </span>
            <div>
              <div className="kpi-value">{numero(recebidas)}</div>
              <div className="kpi-label">respostas recebidas</div>
            </div>
          </div>
          <div className="kpi">
            <span className="kpi-icone" aria-hidden="true">
              <IconeCalendario size={24} />
            </span>
            <div>
              <div className="kpi-value">{comPrazo}</div>
              <div className="kpi-label">prazo definido</div>
            </div>
          </div>
        </section>
      ) : null}

      {erroAcao ? (
        <div className="aviso" role="alert">
          <IconeAlerta size={18} />
          <span>{erroAcao}</span>
        </div>
      ) : null}
      {discoDescartavel(dados?.armazenamento) ? (
        <div className="aviso" role="alert" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning)" }}>
          <IconeAlerta size={18} />
          <span>
            <b>O disco desta hospedagem é temporário.</b> O arquivo de dados não está num volume montado, então um novo deploy
            apaga as coletas e as respostas. Monte um volume na hospedagem e aponte a variável <code>NUPE_DATA</code> para dentro
            dele antes de divulgar os links.
          </span>
        </div>
      ) : null}
      {avisoLinks ? (
        <div className="aviso" role="status">
          <IconeCheck size={18} />
          <span>{avisoLinks}</span>
        </div>
      ) : null}
      {mensagem ? (
        <p className="aviso-salvo" role="status">
          {mensagem}
        </p>
      ) : null}

      {fase === "carregando" ? <Carregando /> : null}
      {fase === "erro" ? <Falha texto={erro} aoTentar={recarregar} /> : null}
      {fase === "pronto" ? (
        <>
          <h2 className="titulo-secao">Coletas por público</h2>
          <div className="coletas-grafo">
            {abertas.map((c) => {
              const total = dados.counts.find((x) => x.audience === c.audience)?.total ?? 0;
              return (
                <section key={c.id} className="painel coleta" aria-labelledby={`coleta-${c.id}`}>
                  <header>
                    <div className="coleta-titulo">
                      <span className="icone-circulo">
                        <IconePublico publico={c.audience} size={22} />
                      </span>
                      <h3 id={`coleta-${c.id}`} className="secao">
                        {rotuloPublico(c.audience)}
                      </h3>
                    </div>
                    <span className={classeEstado(c.status)}>{STATUS[c.status]}</span>
                  </header>

                  <div className="coleta-campos">
                    <div className="campo">
                      <label htmlFor={`rotulo-${c.id}`}>Nome interno da coleta</label>
                      <input
                        id={`rotulo-${c.id}`}
                        className="input"
                        defaultValue={c.label}
                        onBlur={(e) => {
                          if (e.target.value !== c.label) void atualizar(c, { label: e.target.value }, "Nome da coleta atualizado.");
                        }}
                      />
                    </div>
                    <div className="campo">
                      <label htmlFor={`prazo-${c.id}`}>Prazo final (opcional)</label>
                      <input
                        id={`prazo-${c.id}`}
                        className="input"
                        type="date"
                        defaultValue={c.closesAt ? c.closesAt.slice(0, 10) : ""}
                        onChange={(e) => {
                          const v = e.target.value ? `${e.target.value}T23:59:00` : null;
                          void atualizar(c, { closesAt: v }, v ? "Prazo atualizado." : "Prazo removido.");
                        }}
                      />
                    </div>
                  </div>

                    <p className="coleta-numeros">
                      <span className="coleta-total">{numero(total)}</span>
                      <span className="meta">
                        resposta{total === 1 ? "" : "s"} recebida{total === 1 ? "" : "s"} · {prazo(c.closesAt)}
                      </span>
                    </p>
                    {c.status === "aberta" ? <LinkPublico collection={c} aoAtualizar={recarregar} /> : null}

                    {c.status !== "aberta" ? (
                      <button
                        type="button"
                        className="btn primario largo"
                        disabled={ocupado === c.id}
                        onClick={() =>
                          void atualizar(c, { status: "aberta" }, `Coleta ${publicoNaFrase(c.audience)} aberta.`)
                        }
                      >
                        {c.status === "encerrada" ? "Reabrir coleta" : "Abrir coleta"}
                      </button>
                    ) : (
                      <BotaoConfirmavel
                        rotulo={`Encerrar a coleta ${publicoNaFrase(c.audience)}`}
                        pergunta="Encerrar a coleta? Novas respostas deixam de ser aceitas."
                        acoes={["Encerrar coleta", "Cancelar"]}
                        variante="btn perigo largo"
                        ocupado={ocupado === c.id}
                        aoConfirmar={() => void atualizar(c, { status: "encerrada" }, "Coleta encerrada.")}
                      >
                        Encerrar coleta
                      </BotaoConfirmavel>
                    )}
                    {!c.publicId && c.status !== "aberta" ? (
                      <span className="micro">O link é criado ao abrir a coleta.</span>
                    ) : null}
                </section>
              );
            })}
          </div>

          {demo.length > 0 ? (
            <>
              <h2 className="titulo-secao">
                Coletas demonstrativas
                <span className="selo-demo">dados fictícios</span>
              </h2>
              <div className="coletas-grafo">
                {demo.map((c) => (
                  <section key={c.id} className="painel coleta demo" aria-labelledby={`demo-${c.id}`}>
                    <header>
                      <div className="coleta-titulo">
                        <span className="icone-circulo claro">
                          <IconePublico publico={c.audience} size={22} />
                        </span>
                        <h3 id={`demo-${c.id}`} className="secao">
                          {rotuloPublico(c.audience)}
                        </h3>
                      </div>
                      <span className={classeEstado(c.status)}>{STATUS[c.status]}</span>
                    </header>
                    <p className="legenda" style={{ marginTop: 12, fontSize: "var(--fs-small)" }}>
                      {c.label.replace(/\s*\(fictício\)/i, "")} · {numero(c.responses)}{" "}
                      {c.responses === 1 ? "resposta" : "respostas"}. Para praticar sem usar dados reais.
                    </p>
                  </section>
                ))}
              </div>
            </>
          ) : null}

          <section className="painel painel-info" aria-labelledby="sobre-links">
            <div className="painel-info-icone" aria-hidden="true">
              <IconeDocumento size={22} />
            </div>
            <div>
              <h2 id="sobre-links" className="secao">
                Como divulgar os links
              </h2>
              <div className="duas-colunas legenda" style={{ marginTop: 8 }}>
                <p>
                  Cada público recebe apenas o link do seu questionário. Envie por WhatsApp ou e-mail para a coordenação, o
                  corpo docente, as turmas e a equipe do núcleo.
                </p>
                <p>
                  Os links não pedem nome nem e-mail e não registram endereço de IP. Um mesmo aparelho pode responder uma vez
                  por questionário.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function CabeçalhoSecao({ id, children, acao }: { id: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <header className="secao-cab">
      <h2 id={id} className="secao">
        {children}
      </h2>
      {acao}
    </header>
  );
}

export function Painel() {
  const { fase, dados, erro, recarregar } = useDados<DashboardView>(carregar.dashboard);
  const [avisoDemo, setAvisoDemo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function demo(acao: "seed" | "clear") {
    setOcupado(true);
    setAvisoDemo("");
    try {
      await api.post(`/api/demo/${acao}`, {});
      await recarregar();
    } catch (e) {
      setAvisoDemo(e instanceof ApiError ? e.message : "Não foi possível alterar os dados fictícios.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase === "carregando") return <Carregando />;
  if (fase === "erro") return <Falha texto={erro} aoTentar={recarregar} />;

  const total = dados.counts.reduce((s, c) => s + c.total, 0);
  const abertas = dados.collections.filter((c) => c.status === "aberta").length;
  const respostasDemo = dados.collections.filter((c) => c.demo).reduce((s, c) => s + c.responses, 0);
  const temDemo = Boolean(dados.demo) || dados.collections.some((c) => c.demo);

  return (
    <>
      <div className="cabeca">
        <div>
          <h1 className="titulo">Painel</h1>
          <p className="sub">Contagens das respostas recebidas por público. Percentuais só aparecem com amostra de 5 ou mais.</p>
        </div>
        <div className="acoes">
          <a
            className="btn primario"
            href="/coletas"
            onClick={(e) => {
              e.preventDefault();
              irPara("/coletas");
            }}
          >
            <IconeLink size={17} />
            Divulgar coletas
          </a>
        </div>
      </div>

      {temDemo ? (
        <div className="aviso" role="note">
          <IconeAlerta size={20} />
          <span>
            <b>Há dados de demonstração no sistema.</b> As {respostasDemo} respostas fictícias e as fichas de exemplo entram
            nos resultados e no relatório. Remova antes de entregar o trabalho.
          </span>
          <button
            type="button"
            className="texto-link"
            disabled={ocupado}
            onClick={() => void demo("clear")}
          >
            Remover
          </button>
        </div>
      ) : null}
      {avisoDemo ? (
        <p className="erro-texto" role="alert">
          {avisoDemo}
        </p>
      ) : null}

      <section className="kpis" aria-label="Resumo da coleta">
        {dados.counts.map((c) => (
          <div key={c.audience} className="kpi">
            <span className="kpi-icone" aria-hidden="true">
              <IconePublico publico={c.audience} size={24} />
            </span>
            <div>
              <div className="kpi-label">{rotuloPublico(c.audience)}</div>
              <div className="kpi-value">{numero(c.total)}</div>
              <div className="delta">
                {c.total >= 5 ? "percentuais liberados" : c.total > 0 ? "amostra pequena: só contagens" : "sem respostas ainda"}
              </div>
            </div>
          </div>
        ))}
        <div className="kpi">
          <span className="kpi-icone" aria-hidden="true">
            <IconeCalendario size={24} />
          </span>
          <div>
            <div className="kpi-label">Coletas abertas</div>
            <div className="kpi-value">
              {abertas}
              <small>de {dados.collections.length}</small>
            </div>
            <div className="delta">{numero(total)} respostas no total</div>
          </div>
        </div>
      </section>

      <div className="grade-principal">
        <div className="pilha">
          <section className="painel" aria-labelledby="estado-coletas">
            <CabeçalhoSecao
              id="estado-coletas"
              acao={
                <a
                  className="texto-link"
                  href="/coletas"
                  onClick={(e) => {
                    e.preventDefault();
                    irPara("/coletas");
                  }}
                >
                  Gerenciar links
                </a>
              }
            >
              Coletas
            </CabeçalhoSecao>
            <div className="tabela-wrap">
              <table className="tabela-coletas">
                <thead>
                  <tr>
                    <th scope="col">Público</th>
                    <th scope="col">Coleta</th>
                    <th scope="col">Situação</th>
                    <th scope="col" className="n">
                      Respostas
                    </th>
                    <th scope="col">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.collections.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" className="celula-publico">
                        <span className="icone-circulo pequeno" aria-hidden="true">
                          <IconePublico publico={c.audience} size={16} />
                        </span>
                        {rotuloPublico(c.audience)}
                      </th>
                      <td>
                        {c.label.replace(/\s*\(fictício\)/i, "")}
                        {c.demo ? <span className="micro"> · fictício</span> : null}
                      </td>
                      <td>
                        <span className={classeEstado(c.status)}>{STATUS[c.status]}</span>
                      </td>
                      <td className="n">{numero(c.responses)}</td>
                      <td className="meta">{c.closesAt ? dataCurta(c.closesAt) : "sem prazo"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="micro" style={{ marginTop: 12 }}>
              O detalhamento com prazo e link de cada coleta fica em{" "}
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
            </p>
          </section>

          <section className="painel painel-info" aria-labelledby="fichas-pendentes">
            <div className="painel-info-icone" aria-hidden="true">
              <IconeDocumento size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="painel-info-cab">
                <h2 id="fichas-pendentes" className="secao">
                  Antes de gerar o relatório
                </h2>
                <a
                  className="texto-link"
                  href="/relatorio"
                  onClick={(e) => {
                    e.preventDefault();
                    irPara("/relatorio");
                  }}
                >
                  Abrir relatório <IconeSeta size={14} />
                </a>
              </div>
              <p className="legenda" style={{ marginTop: 6 }}>
                {dados.missing === 0
                  ? "Todas as fichas obrigatórias estão preenchidas."
                  : `${dados.missing} ${dados.missing === 1 ? "campo" : "campos"} das fichas e matrizes ainda ${dados.missing === 1 ? "aparece" : "aparecem"} como [preencher] no relatório.`}
              </p>
              {respostasDemo > 0 ? (
                <p className="legenda" style={{ marginTop: 6 }}>
                  O relatório inclui {respostasDemo} {respostasDemo === 1 ? "resposta fictícia" : "respostas fictícias"} da
                  demonstração. Remova os dados fictícios antes de entregar o trabalho.
                </p>
              ) : null}
              <ul className="atalhos">
                <li>
                  <a href="/fichas/1">Ficha 1 e 2 · Levantamento e números</a>
                </li>
                <li>
                  <a href="/fichas/3">Ficha 3 · Fluxo atual e gargalos</a>
                </li>
                <li>
                  <a href="/matrizes">Matrizes · Porter, SWOT e GUT</a>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <aside className="pilha" aria-label="Laterais do painel">
          <section className="painel" aria-labelledby="ultimas">
            <CabeçalhoSecao id="ultimas">Últimas respostas</CabeçalhoSecao>
            {dados.recent.length === 0 ? (
              <Vazio>Nenhuma resposta recebida.</Vazio>
            ) : (
              <ul className="lista-atividade">
                {dados.recent.slice(0, 5).map((d, i) => (
                  <li key={i}>
                    <span className="ponto" aria-hidden="true" />
                    <span>
                      {dataCurta(d)} ·{" "}
                      <span className="meta">{new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="etiqueta">recebida</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="micro" style={{ marginTop: 12 }}>
              Como as respostas são anônimas, não há identificação do público em cada data.
            </p>
          </section>

          <section className="painel" aria-labelledby="registro">
            <CabeçalhoSecao id="registro">Registro de atividade</CabeçalhoSecao>
            {dados.log.length === 0 ? (
              <Vazio>Ainda sem atividade registrada.</Vazio>
            ) : (
              <ul className="lista-atividade">
                {dados.log.map((l, i) => (
                  <li key={i}>
                    <span className="ponto" aria-hidden="true" />
                    <span>{l.action}</span>
                    <span className="meta">{dataCurta(l.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="painel" aria-labelledby="demo">
            <CabeçalhoSecao id="demo">Demonstração</CabeçalhoSecao>
            <p className="legenda" style={{ marginBottom: 14, fontSize: "var(--fs-small)" }}>
              Carrega 30 respostas fictícias em cada questionário e preenche as fichas e matrizes com um exemplo completo. Serve
              para conhecer o painel antes da coleta real; os números entram nos resultados e no relatório enquanto estiverem
              carregados.
            </p>
            {temDemo ? (
              <button type="button" className="btn largo" disabled={ocupado} onClick={() => void demo("clear")}>
                Remover dados fictícios
              </button>
            ) : (
              <button type="button" className="btn largo" disabled={ocupado} onClick={() => void demo("seed")}>
                Carregar dados fictícios
              </button>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
