import { api, ApiError } from "../lib/http";
import { PLACEHOLDER, PORTER_LABELS, SWOT_LABELS, validateSwot, type Matrices } from "@nupe/core";
import { carregar, type RecordsView } from "../lib/dados";
import { useDados } from "../lib/useDados";
import { Carregando, Falha } from "../componentes/comuns";
import { useEffect, useRef, useState } from "react";
import { irPara } from "../lib/rotas";
import { marcarPendente, registrarEnvio } from "../lib/gravacao";
import { BotaoConfirmavel } from "../componentes/Confirmar";
import { BotaoDesfazer, RecuperarContexto, chaveLinha } from "../componentes/Historico";

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
  /** Itens com cópia anterior no servidor, conforme o último envio aceito. */
  const [copias, setCopias] = useState<Record<string, boolean>>({});
  const [emCurso, setEmCurso] = useState("");
  const [erroDesfazer, setErroDesfazer] = useState("");
  /** Itens tirados das listas nesta sessão, para o Desfazer ficar ao alcance. */
  const [removidos, setRemovidos] = useState<Array<Matrices["gut"][number] & { de: string }>>([]);
  // useRef reproduz React 19: o valor do ref já vale dentro do mesmo envio.
  const pendente = useRef<Matrices | null>(null);

  useEffect(() => {
    if (fase === "pronto" && !local) setLocal({ ...vazio(), ...dados.matrices });
  }, [fase, dados, local]);

  const copia = (itemId: string) => Boolean(copias[chaveLinha("matrices", itemId)]);

  /** Todos os itens das três matrizes, com a lista a que pertencem. */
  const todosItens = (matriz: Matrices) => [
    ...Object.entries(matriz.porter).flatMap(([de, lista]) => lista.map((x) => ({ ...x, de }))),
    ...Object.entries(matriz.swot).flatMap(([de, lista]) => lista.map((x) => ({ ...x, de }))),
    ...matriz.gut.map((x) => ({ ...x, de: "gut" })),
  ];

  function gravar(m: Matrices) {
    // Itens que saíram de qualquer lista ficam à vista para voltar atrás: são o
    // único jeito de alcançar o botão de um item que já não está no lugar.
    const atuais = new Set(todosItens(m).map((x) => x.id));
    const sairam = local ? todosItens(local).filter((x) => !atuais.has(x.id)) : [];
    if (sairam.length) {
      const ids = new Set(sairam.map((x) => x.id));
      setRemovidos((antes) => [...sairam, ...antes.filter((x) => !ids.has(x.id))]);
    }
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
      const r = await api.put<{ copias?: Record<string, boolean> }>("/api/records/matrices", corpo);
      // O botão "Desfazer" aparece onde o servidor tem o conteúdo anterior.
      if (r?.copias && typeof r.copias === "object") setCopias((antes) => ({ ...antes, ...r.copias }));
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

  /**
   * Volta um item ao conteúdo anterior guardado. Sai antes o que estiver
   * pendente, e a tela relê as matrizes: sem isso, a próxima edição partiria da
   * cópia velha e apagaria a volta atrás.
   */
  async function restaurar(chave: string) {
    if (emCurso) return;
    setEmCurso(chave);
    setErroDesfazer("");
    try {
      await enviar();
      await api.restaurar(chave);
      const { matrices } = await api.get<RecordsView>("/api/records");
      setLocal({ ...vazio(), ...matrices });
      pendente.current = null;
      // Item que voltou do servidor não está mais na lista de removidos.
      setRemovidos((antes) => {
        const voltaram = new Set(todosItens(matrices).map((x) => x.id));
        const ficam = antes.filter((x) => !voltaram.has(x.id));
        return ficam.length === antes.length ? antes : ficam;
      });
    } catch (e) {
      setErroDesfazer(e instanceof ApiError ? e.message : "Não foi possível desfazer agora. O item continua como estava.");
    } finally {
      setEmCurso("");
    }
  }

  const desfazer = (itemId: string, rotulo: string) => (
    <BotaoDesfazer chave={chaveLinha("matrices", itemId)} temCopia={copia(itemId)} rotulo={rotulo} />
  );
  /** Itens removidos que pertenciam a esta lista (o botão fica no lugar deles). */
  const removidosDe = (chaveLista: string) => removidos.filter((x) => x.de === chaveLista);

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
  const recuperar = { emCurso, erro: erroDesfazer, restaurar: (chave: string) => void restaurar(chave) };

  return (
    <RecuperarContexto.Provider value={recuperar}>
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
                copia={copia}
                removidos={removidosDe(p.key)}
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
                copia={copia}
                removidos={removidosDe(s.key)}
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
          <table className="tabela-ficha tabela-gut">
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
                      <textarea
                        key={`texto:${item.text}`}
                        className="input"
                        rows={2}
                        aria-label={`Gargalo da linha ${i + 1}`}
                        defaultValue={item.text}
                        ref={(el) => {
                          if (!el) return;
                          crescerComTexto(el);
                          requestAnimationFrame(() => crescerComTexto(el));
                        }}
                        onInput={(e) => crescerComTexto(e.currentTarget)}
                        onBlur={(e) => {
                          if (e.target.value !== item.text) trocar({ text: e.target.value });
                        }}
                      />
                    </td>
                    <td>
                      <textarea
                        key={`evidencia:${item.evidence ?? ""}`}
                        className="input"
                        rows={2}
                        aria-label={`Origem da linha ${i + 1}`}
                        defaultValue={item.evidence ?? ""}
                        placeholder="pergunta, ficha ou diário"
                        ref={(el) => {
                          if (!el) return;
                          crescerComTexto(el);
                          requestAnimationFrame(() => crescerComTexto(el));
                        }}
                        onInput={(e) => crescerComTexto(e.currentTarget)}
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
                      <div className="acoes-linha">
                        <BotaoConfirmavel
                          rotulo={`Remover linha ${i + 1}`}
                          pergunta={`Remover o gargalo da linha ${i + 1}? Ele sai da matriz e do relatório. Dá para voltar atrás em seguida.`}
                          acoes={["Remover gargalo", "Manter"]}
                          variante="btn sutil perigo"
                          aoConfirmar={() => gravar({ ...m, gut: m.gut.filter((_, j) => j !== i) })}
                        >
                          Remover
                        </BotaoConfirmavel>
                        {desfazer(item.id, `a linha ${i + 1} da matriz GUT`)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {removidosDe("gut").length ? (
          <div className="desfazer-removidos">
            <p className="micro">Removidos agora</p>
            <ul>
              {removidosDe("gut").map((item) => (
                <li key={item.id}>
                  <span>{item.text.trim().slice(0, 40) || "gargalo sem texto"}</span>
                  {desfazer(item.id, "o gargalo removido")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
      {erroDesfazer ? (
        <p className="erro-texto" role="alert" style={{ marginTop: 8 }}>
          {erroDesfazer}
        </p>
      ) : null}
    </RecuperarContexto.Provider>
  );
}

/** Abre a caixa de texto na altura do conteúdo: o que está escrito não fica cortado. */
function crescerComTexto(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

function Lista({
  itens,
  rotulo,
  aoMudar,
  copia,
  removidos,
}: {
  itens: Matrices["gut"];
  rotulo: string;
  aoMudar: (itens: Matrices["gut"]) => void;
  /** O item tem cópia anterior no servidor? */
  copia: (itemId: string) => boolean;
  /** Itens removidos da lista nesta sessão, para o Desfazer ficar ao alcance. */
  removidos: Array<Matrices["gut"][number] & { de: string }>;
}) {
  return (
    <div className="lista-matriz">
      {itens.map((item, i) => (
        <div key={item.id} className="linha-matriz">
          {/* O texto e a evidência são a chave: quando o servidor devolve outro
              conteúdo (volta atrás), a caixa é refeita com ele. */}
          <textarea
            key={`texto:${item.text}`}
            className="input"
            rows={2}
            aria-label={`${rotulo}, item ${i + 1}`}
            defaultValue={item.text}
            placeholder={PLACEHOLDER}
            ref={(el) => {
              // Abre a caixa na altura do texto para o item não aparecer cortado.
              if (!el) return;
              crescerComTexto(el);
              requestAnimationFrame(() => crescerComTexto(el));
            }}
            onInput={(e) => crescerComTexto(e.currentTarget)}
            onBlur={(e) => {
              if (e.target.value !== item.text) aoMudar(itens.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)));
            }}
          />
          <input
            key={`evidencia:${item.evidence ?? ""}`}
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
          <div className="acoes-linha">
            <BotaoDesfazer
              chave={chaveLinha("matrices", item.id)}
              temCopia={copia(item.id)}
              rotulo={`${rotulo}, item ${i + 1}`}
            />
          </div>
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
      {removidos.length ? (
        <div className="desfazer-removidos">
          <p className="micro">Removidos agora</p>
          <ul>
            {removidos.map((item, i) => (
              <li key={item.id}>
                <span>{item.text.trim().slice(0, 40) || `item ${i + 1}`}</span>
                <BotaoDesfazer
                  chave={chaveLinha("matrices", item.id)}
                  temCopia={copia(item.id)}
                  rotulo={`o item removido ${rotulo}`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

