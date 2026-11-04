import { api, ApiError } from "../lib/http";
import { PLACEHOLDER, PORTER_LABELS, SWOT_LABELS, validateSwot, type Matrices } from "@nupe/core";
import { carregar, type RecordsView } from "../lib/dados";
import { useDados } from "../lib/useDados";
import { Carregando, Falha } from "../componentes/comuns";
import { useEffect, useRef, useState } from "react";
import { irPara } from "../lib/rotas";
import { marcarPendente, registrarEnvio } from "../lib/gravacao";

function novoId() {
  return Math.random().toString(36).slice(2, 10);
}

function vazio(): Matrices {
  const lista = () => [];
  return {
    porter: { clientes: lista(), fornecedores: lista(), concorrentes: lista(), novosEntrantes: lista(), substitutos: lista() },
    swot: { forcas: lista(), fraquezas: lista(), oportunidades: lista(), ameacas: lista() },
    gut: [],
    notes: {},
  };
}

export function Matrizes() {
  const { fase, dados, erro, recarregar } = useDados<RecordsView>(carregar.records, []);
  const [texto, setTexto] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  // Estado local das matrizes. Sem ele, duas edições seguidas podem partir do
  // mesmo valor salvo e uma apagar a outra.
  const [local, setLocal] = useState<Matrices | null>(null);
  const [salvando, setSalvando] = useState(false);
  // useRef reproduz React 19: o valor do ref já vale dentro do mesmo envio.
  const pendente = useRef<Matrices | null>(null);

  useEffect(() => {
    if (fase === "pronto" && !local) setLocal({ ...vazio(), ...dados.matrices });
  }, [fase, dados, local]);

  function gravar(m: Matrices) {
    setLocal(m);
    pendente.current = m;
    marcarPendente(true);
    void enviar();
  }

  async function enviar(): Promise<void> {
    if (salvando || !pendente.current) {
      if (!salvando && !pendente.current) marcarPendente(false);
      return;
    }
    const corpo = pendente.current;
    pendente.current = null;
    setSalvando(true);
    setTexto("Salvando…");
    setErroSalvar("");
    try {
      await api.put("/api/records/matrices", corpo);
      setTexto(
        pendente.current
          ? "Salvando…"
          : `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (e) {
      setErroSalvar(e instanceof ApiError ? e.message : "Não foi possível salvar.");
      setTexto("");
    } finally {
      setSalvando(false);
    }
    if (pendente.current) await enviar();
    else marcarPendente(false);
  }

  // Sair da tela leva a última edição junto, sem esperar o atraso do salvamento.
  useEffect(() => {
    const sair = registrarEnvio(async () => {
      await enviar();
    });
    return () => {
      sair();
      marcarPendente(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fase === "carregando") return <Carregando />;
  if (fase === "erro") return <Falha texto={erro} aoTentar={recarregar} />;

  const m: Matrices = { ...vazio(), ...(local ?? dados.matrices) };
  const swotProblemas = validateSwot(m);

  return (
    <>
      <div className="cabeca">
        <div>
          <h1 className="titulo">Matrizes</h1>
          <p className="sub">
            Analise as cinco forças (Porter), os quatro quadrantes (SWOT) e ordene os gargalos pela pontuação GUT. O que não
            estiver fundamentado fica marcado para a próxima visita.
          </p>
        </div>
      </div>

      <section className="painel" aria-labelledby="porter-t">
        <header>
          <h2 id="porter-t" className="secao">
            Forças de Porter
          </h2>
          <span className="meta">Os cinco lados que pressionam o setor</span>
        </header>
        <div className="porter-grade">
          {PORTER_LABELS.map((p) => (
            <div key={p.key} className="porter-col">
              <h3>{p.label}</h3>
              <p className="micro">{p.hint}</p>
              <Lista
                itens={m.porter[p.key]}
                rotulo={p.label}
                aoMudar={(itens) => gravar({ ...m, porter: { ...m.porter, [p.key]: itens } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="painel" aria-labelledby="swot-t" style={{ marginTop: 16 }}>
        <header>
          <h2 id="swot-t" className="secao">
            Matriz SWOT
          </h2>
          <span className="micro">Interno: forças e fraquezas · Externo: oportunidades e ameaças</span>
        </header>
        {swotProblemas.length ? (
          <ul className="swot-problemas" role="status">
            {swotProblemas.map((p, i) => (
              <li key={i} className={p.level === "erro" ? "erro-texto" : "meta"}>
                {p.level === "erro" ? "Erro: " : "Atenção: "}
                {p.text}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="swot-grade">
          {SWOT_LABELS.map((s) => (
            <div key={s.key} className="swot-col">
              <h3>
                {s.label}
                <span className="micro"> · {s.nature}</span>
              </h3>
              <Lista
                itens={m.swot[s.key]}
                rotulo={s.label}
                aoMudar={(itens) => gravar({ ...m, swot: { ...m.swot, [s.key]: itens } })}
              />
              {s.key === "forcas" ? (
                <p className="micro">Oportunidade precisa de uma força interna que a aproveite.</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="painel" aria-labelledby="gut-t" style={{ marginTop: 16 }}>
        <header>
          <h2 id="gut-t" className="secao">
            Matriz GUT
          </h2>
          <span className="meta">Gravidade × Urgência × Tendência (1 a 5)</span>
        </header>
        <p className="legenda" style={{ maxWidth: "68ch" }}>
          Ordene os gargalos encontrados na ficha 3 e na análise. Alta prioridade a partir de 60 pontos; média entre 30 e 59.
        </p>
        <div className="tabela-wrap">
          <table className="tabela-ficha">
            <thead>
              <tr>
                <th scope="col">Gargalo</th>
                <th scope="col">Origem ou evidência</th>
                <th scope="col" className="n">
                  G
                </th>
                <th scope="col" className="n">
                  U
                </th>
                <th scope="col" className="n">
                  T
                </th>
                <th scope="col" className="n">
                  Pontos
                </th>
                <th scope="col">Prioridade</th>
                <th scope="col">
                  <span className="micro">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {m.gut.map((item, i) => {
                const g = item.gravity ?? 1;
                const u = item.urgency ?? 1;
                const t = item.tendency ?? 1;
                const pontos = g * u * t;
                const prioridade = pontos >= 60 ? "Alta" : pontos >= 30 ? "Média" : "Baixa";
                const trocar = (mudanca: Partial<typeof item>) =>
                  gravar({ ...m, gut: m.gut.map((x, j) => (j === i ? { ...x, ...mudanca } : x)) });
                const nota = (v: number | undefined, campo: "gravity" | "urgency" | "tendency", nome: string) => (
                  <select
                    className="input nota"
                    aria-label={`${nome} da linha ${i + 1}`}
                    value={v ?? ""}
                    onChange={(e) => trocar({ [campo]: e.target.value ? Number(e.target.value) : undefined })}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                );
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        className="input"
                        aria-label={`Gargalo da linha ${i + 1}`}
                        defaultValue={item.text}
                        onBlur={(e) => {
                          if (e.target.value !== item.text) trocar({ text: e.target.value });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        aria-label={`Origem da linha ${i + 1}`}
                        defaultValue={item.evidence ?? ""}
                        placeholder="pergunta, ficha ou diário"
                        onBlur={(e) => {
                          if ((e.target.value || undefined) !== item.evidence) trocar({ evidence: e.target.value || undefined });
                        }}
                      />
                    </td>
                    <td className="n">{nota(item.gravity, "gravity", "Gravidade")}</td>
                    <td className="n">{nota(item.urgency, "urgency", "Urgência")}</td>
                    <td className="n">{nota(item.tendency, "tendency", "Tendência")}</td>
                    <td className="n num">{pontos}</td>
                    <td className={prioridade === "Alta" ? "estado pend" : ""}>{prioridade}</td>
                    <td>
                      <button
                        type="button"
                        className="btn sutil perigo"
                        aria-label={`Remover linha ${i + 1}`}
                        onClick={() => gravar({ ...m, gut: m.gut.filter((_, j) => j !== i) })}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() => gravar({ ...m, gut: [...m.gut, { id: novoId(), text: "", gravity: undefined, urgency: undefined, tendency: undefined }] })}
        >
          Adicionar gargalo
        </button>
      </section>

      <section className="painel" aria-labelledby="guia-t" style={{ marginTop: 16 }}>
        <header>
          <h2 id="guia-t" className="secao">
            Como usar, etapa por etapa
          </h2>
          <span className="micro">Guia de consulta, gerado a partir das fichas 3 a 6</span>
        </header>
        <ol className="guia-lista">
          <li>
            <h3>1. Levantar (Porter)</h3>
            <p className="legenda">
              Comece pelos clientes do núcleo (docentes, estudantes, comunidade). Registre quem entrega o que você precisa
              (pró-reitorias, sistemas) e quem disputa o mesmo público.
            </p>
          </li>
          <li>
            <h3>2. Diagnosticar (SWOT)</h3>
            <p className="legenda">
              Separe o que depende do setor do que vem de fora. Oportunidade só entra se existir uma força interna que consiga
              aproveitá-la; uma fraqueza não se repete como oportunidade.
            </p>
          </li>
          <li>
            <h3>3. Propor (5W2H)</h3>
            <p className="legenda">
              Na ficha 6, responda o quê, por quê, quem, onde, quando, como e quanto. A proposta precisa caber no tempo do
              estágio e na estrutura atual do núcleo.
            </p>
          </li>
          <li>
            <h3>4. Acompanhar (PDCA)</h3>
            <p className="legenda">
              Planeje a ação, faça em escala pequena, cheque com um indicador e ajuste. O diário de campo (ficha 7) registra o
              que aconteceu em cada semana.
            </p>
          </li>
        </ol>
        <p className="micro" style={{ marginTop: 12 }}>
          As fichas citadas ficam em{" "}
          <a className="texto-link" href="/fichas/6" onClick={(e) => { e.preventDefault(); irPara("/fichas/6"); }}>
            Ficha 6 · Plano de melhoria
          </a>
          .
        </p>
      </section>

      <p className={erroSalvar ? "erro-texto" : "salvo"} role="status" aria-live="polite" style={{ marginTop: 16 }}>
        {erroSalvar || texto}
      </p>
    </>
  );
}

function Lista({
  itens,
  rotulo,
  aoMudar,
}: {
  itens: Matrices["gut"];
  rotulo: string;
  aoMudar: (itens: Matrices["gut"]) => void;
}) {
  return (
    <div className="lista-matriz">
      {itens.map((item, i) => (
        <div key={item.id} className="linha-matriz">
          <textarea
            className="input"
            rows={2}
            aria-label={`${rotulo}, item ${i + 1}`}
            defaultValue={item.text}
            placeholder={PLACEHOLDER}
            onBlur={(e) => {
              if (e.target.value !== item.text) aoMudar(itens.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)));
            }}
          />
          <input
            className="input"
            aria-label={`${rotulo}, evidência do item ${i + 1}`}
            defaultValue={item.evidence ?? ""}
            placeholder="evidência"
            onBlur={(e) => {
              if ((e.target.value || undefined) !== item.evidence)
                aoMudar(itens.map((x, j) => (j === i ? { ...x, evidence: e.target.value || undefined } : x)));
            }}
          />
          <button
            type="button"
            className="btn sutil perigo"
            aria-label={`Remover ${rotulo}, item ${i + 1}`}
            onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn sutil"
        onClick={() => {
          const novos = [...itens, { id: novoId(), text: "", evidence: undefined }];
          aoMudar(novos);
          setTimeout(() => {
            const campo = document.querySelector<HTMLTextAreaElement>(`[aria-label="${rotulo}, item ${novos.length}"]`);
            campo?.focus();
          }, 60);
        }}
      >
        Adicionar item
      </button>
    </div>
  );
}

