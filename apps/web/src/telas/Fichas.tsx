import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DIARY_COLUMNS,
  FIVE_W2H_KEYS,
  FIVE_W2H_INITIAL,
  FLOW_COLUMNS,
  FLOW_TEMPLATES,
  GLOSSARY_COLUMNS,
  GLOSSARY_INITIAL,
  INSTITUTION_FIELDS,
  INTERVIEW_GUIDE,
  NUMBERS_COLUMNS,
  NUMBERS_INITIAL,
  PDCA_KEYS,
  PLACEHOLDER,
  PROCEDURE_COLUMNS,
  PROCEDURES_INITIAL,
  SYSTEM_FIELDS,
  SYSTEM_INITIAL,
} from "@nupe/core";
import { api, ApiError } from "../lib/http";
import { carregar, type RecordsView } from "../lib/dados";
import { useDados } from "../lib/useDados";
import { Carregando, Falha, atrasado } from "../componentes/comuns";
import { BotaoConfirmavel } from "../componentes/Confirmar";
import { registrarEnvio, marcarPendente } from "../lib/gravacao";

/** Aviso em tela estreita: aparece ao editar e some sozinho depois de salvar. */
const AvisoEdicao = createContext<() => void>(() => undefined);
import { irPara } from "../lib/rotas";
import { BotaoDesfazer, RecuperarContexto, chaveCampo, chaveLinha } from "../componentes/Historico";

/**
 * O que a ficha 6 precisa do quadro para falar com a volta atrás da ficha
 * inteira (não há linha aqui, só um campo por vez).
 */
interface ContextoFicha {
  salvar: Salvar;
  copia: (chave: string) => boolean;
  marcarCopia: (chave: string) => void;
}
const FichaContexto = createContext<ContextoFicha | null>(null);

export const FICHAS = [
  { n: 1, rota: "1", titulo: "Levantamento institucional", resumo: "Missão, estrutura e liderança do núcleo" },
  { n: 2, rota: "2", titulo: "Números do setor", resumo: "Projetos, bolsistas, editais e Publico", },
  { n: 3, rota: "3", titulo: "Fluxo atual e gargalos", resumo: "Etapas, responsáveis e onde trava" },
  { n: 4, rota: "4", titulo: "Mapa de sistemas", resumo: "SISPROEX, iniciação científica e afins" },
  { n: 5, rota: "5", titulo: "Base normativa", resumo: "Procedimento, norma, responsável e prazo" },
  { n: 6, rota: "6", titulo: "Plano de melhoria", resumo: "A ideia em 5W2H e acompanhamento em PDCA" },
  { n: 7, rota: "7", titulo: "Diário de campo", resumo: "O que observou, a fonte e a dúvida" },
  { n: 8, rota: "8", titulo: "Glossário do DCHT XXI", resumo: "Siglas e significado verificados" },
];

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function useSalvarFicha() {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  // 2 = salvando, -1 = erro, 1 = salvo, 0 = parado.
  const [codigo, setCodigo] = useState(0);
  // Só um envio por vez. Se outra edição chegar durante o envio, o corpo
  // pendente substitui e é enviado em seguida, sem perder a última alteração.
  const pendente = useRef<{ kind: string; corpo: unknown } | null>(null);
  const emCurso = useRef<Promise<void> | null>(null);
  /** Chaves com cópia anterior guardada, conforme o último envio aceito. */
  const [copias, setCopias] = useState<Record<string, boolean>>({});
  // Cada envio leva um número: resposta velha não sobrescreve o selo do envio novo.
  const seq = useRef(0);

  const enviar = async (): Promise<void> => {
    if (emCurso.current) return emCurso.current;
    if (!pendente.current) {
      marcarPendente(false);
      return;
    }
    const { kind, corpo } = pendente.current;
    pendente.current = null;
    const meu = ++seq.current;
    emCurso.current = (async () => {
      marcarPendente(true);
      setTexto("Salvando…");
      setCodigo(2);
      setErro("");
      try {
        const r = await api.put<{ copias?: Record<string, boolean> }>(`/api/records/${kind}`, corpo);
        if (meu !== seq.current) return;
        // O botão "Desfazer" só aparece onde o servidor tem o conteúdo anterior.
        if (r?.copias && typeof r.copias === "object") setCopias((antes) => ({ ...antes, ...r.copias }));
        const h = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        setTexto(pendente.current ? "Salvando…" : `Salvo às ${h}`);
        setCodigo(pendente.current ? 2 : 1);
      } catch (e) {
        if (meu === seq.current) {
          setErro(e instanceof ApiError ? e.message : "Não foi possível salvar. Verifique a conexão.");
          setTexto("");
          setCodigo(-1);
        }
      } finally {
        emCurso.current = null;
      }
    })();
    await emCurso.current;
    if (pendente.current) await enviar();
    else marcarPendente(false);
  };

  const preparar = useRef(
    atrasado(() => {
      void enviar();
    }, 700),
  ).current;

  return {
    salvar(kind: string, corpo: unknown) {
      pendente.current = { kind, corpo };
      marcarPendente(true);
      preparar();
    },
    /** Preenche o selo agora, antes do envio atrasado. */
    ocupado() {
      setErro("");
      setTexto("Salvando…");
      setCodigo(2);
    },
    /** Envia o que estiver pendente e espera terminar. */
    async salvarAgora() {
      await enviar();
    },
    /** Envia agora sem esperar: para a navegação que vai recarregar dados. */
    salvarImediato() {
      void enviar();
    },
    texto,
    erro,
    codigo,
    /** Fichas com cópia anterior guardada no servidor (para o Desfazer). */
    copias,
  };
}

function Selo({ texto, erro }: { texto: string; erro: string }) {
  return (
    <p className={erro ? "erro-texto" : "salvo"} role="status" aria-live="polite" style={{ marginTop: 20 }}>
      {erro || texto}
    </p>
  );
}

function fichaDaRota(): string | null {
  const m = /^\/fichas\/(\d+)$/.exec(window.location.pathname);
  return m ? m[1]! : null;
}

export function Ficha({ numero }: { numero: string }) {
  const info = FICHAS.find((f) => f.rota === numero) ?? FICHAS[0]!;
  const auto = useDados<RecordsView>(carregar.records, []);
  // Quadro das fichas: a ficha 1 lê tudo no primeiro carregamento; ao trocar de
  // ficha pela navegação interna, a seguinte já nasce com os dados recém-salvos.
  const [quadro, setQuadro] = useState<{ numero: string; dados: RecordsView } | null>(null);
  const ultimaFoto = useRef<RecordsView | null>(null);
  const trocou = useRef(false);
  useEffect(() => {
    if (auto.fase !== "pronto") return;
    if (!trocou.current) {
      ultimaFoto.current = auto.dados;
      setQuadro({ numero, dados: auto.dados });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.fase, auto.dados]);
  useEffect(() => {
    const abrir = () => {
      const alvo = fichaDaRota();
      const foto = ultimaFoto.current;
      if (!alvo || alvo === numero || !foto) return;
      trocou.current = true;
      setQuadro({ numero: alvo, dados: foto });
      // A foto pode ser anterior à última edição: espera o envio pendente e busca
      // de novo por trás, sem voltar o aviso de carregando.
      void salvarRef.current
        .salvarAgora()
        .then(() => api.get<RecordsView>("/api/records"))
        .then((lista) => {
          ultimaFoto.current = lista;
          setQuadro({ numero: alvo, dados: lista });
        })
        .catch(() => undefined);
    };
    window.addEventListener("popstate", abrir);
    return () => window.removeEventListener("popstate", abrir);
  }, [numero]);

  const carregando = !quadro || quadro.numero !== numero;
  const dados = carregando ? null : quadro.dados;
  const erro = auto.fase === "erro" ? auto.erro : "";
  const recarregar = () => void auto.recarregar();
  const salvar = useSalvarFicha();
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  // Voltar atrás numa linha: a última edição já está gravada (senão o botão não
  // apareceria), então primeiro sai o que estiver pendente, depois o servidor
  // devolve o conteúdo anterior e a ficha é lida de novo — senão a próxima
  // edição partiria do texto velho e desfaria a volta atrás sem querer.
  const [emCurso, setEmCurso] = useState("");
  const [erroDesfazer, setErroDesfazer] = useState("");
  /** Linhas da ficha 2 gravadas pela primeira vez agora: já têm conteúdo anterior (vazio). */
  const [copiasLocais, setCopiasLocais] = useState<Record<string, boolean>>({});
  /** Lê a ficha de novo sem passar pelo aviso de carregando. */
  const recarregarComFicha = useCallback(
    () =>
      api
        .get<RecordsView>("/api/records")
        .then((lista) => {
          ultimaFoto.current = lista;
          setQuadro({ numero: fichaDaRota() ?? numero, dados: lista });
        })
        .catch(() => undefined),
    [numero],
  );
  const restaurarLinha = useCallback(
    (chave: string) => {
      if (emCurso) return;
      setEmCurso(chave);
      setErroDesfazer("");
      void (async () => {
        try {
          await salvarRef.current.salvarAgora();
          await api.restaurar(chave);
          // Busca a ficha e troca também a cópia usada ao abrir a próxima: sem
          // isso, a navegação interna mostraria a tela anterior à volta atrás.
          await recarregarComFicha();
        } catch (e) {
          setErroDesfazer(e instanceof ApiError ? e.message : "Não foi possível desfazer agora. A alteração continua gravada.");
        } finally {
          setEmCurso("");
        }
      })();
    },
    [emCurso, recarregarComFicha],
  );
  const recuperar = useMemo(() => ({ emCurso, erro: erroDesfazer, restaurar: restaurarLinha }), [emCurso, erroDesfazer, restaurarLinha]);
  // Ocupado enquanto roda a volta atrás: editar no meio faria a próxima leitura
  // apagar a edição.
  useEffect(() => {
    if (emCurso) ocupadoRef.current();
  }, [emCurso]);
  /** O informe que inclui a cópia guardada agora pela ficha 2 (a primeira gravação das linhas). */
  const copia = (chave: string) => Boolean(salvar.copias[chave] || copiasLocais[chave]);
  const marcarCopia = useCallback((chave: string) => setCopiasLocais((c) => ({ ...c, [chave]: true })), []);
  const contextoFicha = useMemo(() => ({ salvar, copia, marcarCopia }), [salvar, copia, marcarCopia]);
  // Cada ficha (e as matrizes) registra como enviar o que está pendente quando a
  // tela troca; sem isso, sair logo depois de digitar perderia a última edição.
  useEffect(
    () =>
      registrarEnvio(async () => {
        await salvarRef.current.salvarAgora();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Alterar o horário move os botões e tira o foco da célula a cada tecla.
  const telaEstreita = typeof window !== "undefined" && window.innerWidth <= 860;
  const [selo, setSelo] = useState<"parado" | "aberto">("parado");
  const ocupadoRef = useRef(salvar.ocupado);
  ocupadoRef.current = salvar.ocupado;
  const avisarEdicao = useCallback(() => {
    setSelo("aberto");
    ocupadoRef.current();
  }, []);
  const mostrando = telaEstreita ? (selo === "aberto" ? erro || salvar.texto : "") : erro || salvar.texto;
  useEffect(() => {
    if (selo !== "aberto") return;
    if (salvar.codigo === 2) return;
    const t = setTimeout(() => setSelo("parado"), 3500);
    return () => clearTimeout(t);
  }, [selo, salvar.codigo]);

  return (
    <>
      <div className="ficha-grade">
        <aside className="indice-fichas" aria-label="Fichas de campo">
          <p className="micro" style={{ marginBottom: 8 }}>
            Fichas de campo
          </p>
          <ol>
            {FICHAS.map((f) => (
              <li key={f.n}>
                <a
                  href={`/fichas/${f.rota}`}
                  aria-current={f.rota === info.rota ? "page" : undefined}
                  aria-label={`Ficha ${f.n}: ${f.titulo}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    // Navega primeiro: a impressão da próxima ficha já usa esta foto e
                    // a edição pendente é enviada na troca de rota, sem atraso.
                    irPara(`/fichas/${f.rota}`);
                  }}
                >
                  <span className="num">{f.n}</span>
                  <span className="rotulo-ficha">{f.titulo}</span>
                </a>
              </li>
            ))}
          </ol>
          <p className="micro indice-nota" style={{ marginTop: 12 }}>
            Cada alteração é salva sozinha. As células vazias do relatório mostram [preencher].
          </p>
        </aside>

        <div className="folha" aria-live="off">
          <header className="folha-cab">
            <p className="micro">
              Ficha {info.n} de 8
            </p>
            <h1 className="titulo">{info.titulo}</h1>
            <p className="legenda" style={{ marginTop: 6 }}>
              {info.resumo}
            </p>
          </header>

          {carregando ? <Carregando /> : null}
          {!carregando && erro ? <Falha texto={erro} aoTentar={recarregar} /> : null}
          {dados ? (
            <FichaContexto.Provider value={contextoFicha}>
              <RecuperarContexto.Provider value={recuperar}>
                <AvisoEdicao.Provider value={avisarEdicao}>
                  {info.n === 1 ? <Ficha1 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {info.n === 2 ? <Ficha2 dados={dados} salvar={salvar} copia={copia} marcarCopia={marcarCopia} /> : null}
                  {info.n === 3 ? <Ficha3 dados={dados} salvar={salvar} recarregar={recarregar} copia={copia} /> : null}
                  {info.n === 4 ? <Ficha4 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {info.n === 5 ? <Ficha5 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {info.n === 6 ? <Ficha6 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {info.n === 7 ? <Ficha7 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {info.n === 8 ? <Ficha8 dados={dados} salvar={salvar} copia={copia} /> : null}
                  {erroDesfazer ? (
                    <p className="erro-texto" role="alert" style={{ marginTop: 12 }}>
                      {erroDesfazer}
                    </p>
                  ) : null}
                  {telaEstreita ? null : <Selo texto={salvar.texto} erro={salvar.erro} />}
                </AvisoEdicao.Provider>
              </RecuperarContexto.Provider>
            </FichaContexto.Provider>
          ) : null}
        </div>
      </div>

      {telaEstreita ? (
        <div className="barra-selo nao-imprime" role="status" aria-live="polite" aria-atomic="true">
          {mostrando}
        </div>
      ) : null}
    </>
  );
}

type Salvar = ReturnType<typeof useSalvarFicha>;

/** Campo de texto que envia no blur e também guarda o estado local enquanto digita. */
function CampoTexto({
  valor,
  aoSalvar,
  rotulo,
  multilinha,
  placeholder = PLACEHOLDER,
  tipo = "text",
  fonte,
  folha,
  classe: extra,
}: {
  valor: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
  multilinha?: boolean;
  placeholder?: string;
  tipo?: string;
  fonte?: boolean;
  /** Carimbo da ficha servida: quando muda, a célula volta ao valor do servidor. */
  folha?: string;
  /** Classe extra na caixa (a data do diário ocupa pouco espaço). */
  classe?: string;
}) {
  const [local, setLocal] = useState(valor);
  // Último texto que esta célula mandou ao servidor.
  const mandado = useRef(valor);
  /** Última ficha recebida do servidor, para reconhecer a leitura nova. */
  const ultima = useRef({ folha, valor });
  useEffect(() => {
    const leituraNova = folha !== undefined && folha !== ultima.current.folha;
    ultima.current = { folha, valor };
    // Uma leitura nova que traz o que esta célula mandou não mexe no campo (o
    // cursor saltaria). Fora isso, o texto da célula acompanha o servidor.
    if (leituraNova) {
      if (valor !== mandado.current) {
        setLocal(valor);
        mandado.current = valor;
      }
      return;
    }
    if (valor === mandado.current) return;
    setLocal(valor);
    mandado.current = valor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, folha]);
  const confirmar = () => {
    if (local === valor) return;
    mandado.current = local;
    aoSalvar(local);
  };
  const classe = "input" + (fonte === false ? " campo-fonte" : "") + (extra ? ` ${extra}` : "");
  if (multilinha)
    return (
      <textarea
        className={classe}
        aria-label={rotulo}
        rows={3}
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={confirmar}
      />
    );
  return (
    <input
      className={classe}
      type={tipo}
      aria-label={rotulo}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Ficha1({ dados, salvar, copia }: { dados: RecordsView; salvar: Salvar; copia: (chave: string) => boolean }) {
  const avisar = useContext(AvisoEdicao);
  const campos = dados.institution?.fields ?? {};
  return (
    <div>
      <dl className="campos-ficha">
        {INSTITUTION_FIELDS.map((f) => (
          <div key={f.key} className={f.kind === "long" ? "largo" : undefined}>
            <dt>
              <label htmlFor={`f1-${f.key}`}>{f.label}</label>
              {f.hint ? <span className="micro">{f.hint}</span> : null}
            </dt>
            <dd>
              <CampoTexto
                rotulo={f.label}
                valor={campos[f.key] ?? ""}
                multilinha={f.kind === "long"}
                folha={dados.institution?.updatedAt}
                aoSalvar={(v) => (avisar(), salvar.salvar("institution", { fields: { ...campos, [f.key]: v }, numbers: dados.institution?.numbers ?? [] }))}
              />
              <div className="acoes-linha">
                <BotaoDesfazer chave={chaveCampo("institution", f.key)} temCopia={copia(chaveCampo("institution", f.key))} rotulo={f.label} />
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Ficha2({
  dados,
  salvar,
  copia,
  marcarCopia,
}: {
  dados: RecordsView;
  salvar: Salvar;
  copia: (chave: string) => boolean;
  marcarCopia: (chave: string) => void;
}) {
  const avisar = useContext(AvisoEdicao);
  const [locais] = useState(() =>
    NUMBERS_INITIAL.map((indicator) => ({ id: id(), indicator, value: "", source: "" })),
  );
  // Até o primeiro preenchimento, as linhas-padrão vivem só na tela. A primeira
  // edição de qualquer célula grava a tabela inteira (antes, a linha se perdia).
  const [linhas, setLinhas] = useState<RecordsView["institution"]["numbers"]>(dados.institution?.numbers?.length ? dados.institution.numbers : locais);
  const vazio = useRef(!dados.institution?.numbers?.length);
  const entregue = useRef(dados.institution?.numbers ?? []);
  useEffect(() => {
    const novos = dados.institution?.numbers ?? [];
    if (novos === entregue.current || (!novos.length && vazio.current)) return;
    entregue.current = novos;
    vazio.current = !novos.length;
    setLinhas(novos);
  }, [dados.institution?.numbers]);
  const gravar = (novas: RecordsView["institution"]["numbers"]) => {
    const primeira = vazio.current;
    entregue.current = novas;
    vazio.current = false;
    setLinhas(novas);
    avisar();
    // A primeira gravação deixa o conteúdo anterior vazio, mas guardado: essas
    // linhas também podem ser desfeitas, mesmo antes do servidor confirmar.
    if (primeira) for (const r of novas) marcarCopia(chaveLinha("institution", r.id));
    salvar.salvar("institution", { fields: dados.institution?.fields ?? {}, numbers: novas });
  };

  return (
    <div>
      <p className="legenda" style={{ marginBottom: 12, maxWidth: "68ch" }}>
        Anote o número e de onde veio (documento e ano). Indicador sem fonte não entra no relatório como dado.
      </p>
      <p className="tabela-dica">Deslize para o lado para ver as outras colunas.</p>
      <div className="tabela-wrap" tabIndex={0} role="group" aria-label="Tabela da ficha. Em telas estreitas, deslize na horizontal para ver as outras colunas."> <table className="tabela-ficha tabela-numeros">
          <thead>
            <tr>
              {NUMBERS_COLUMNS.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="micro">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => (
              <tr key={r.id}>
                {NUMBERS_COLUMNS.map((c) => (
                  <td key={c.key}>
                    <CampoTexto
                      rotulo={`${r.indicator || `linha ${i + 1}`}, ${c.label}`}
                      valor={(r as Record<string, string>)[c.key] ?? ""}
                      aoSalvar={(v) => (avisar(), gravar(linhas.map((x) => (x.id === r.id ? { ...x, [c.key]: v } : x))))}
                    />
                  </td>
                ))}
                <td>
                  <BotaoDesfazer
                    chave={chaveLinha("institution", r.id)}
                    temCopia={copia(chaveLinha("institution", r.id))}
                    rotulo={`a linha ${i + 1} da ficha 2`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ficha3({
  dados,
  salvar,
  recarregar,
  copia,
}: {
  dados: RecordsView;
  salvar: Salvar;
  recarregar: () => void;
  copia: (chave: string) => boolean;
}) {
  const avisar = useContext(AvisoEdicao);
  // Cópia local: editar, adicionar e remover usam sempre o que está na tela,
  // nunca a foto que veio do servidor (senão o item removido volta a aparecer).
  const [fluxos, setFluxos] = useState<RecordsView["flows"]>(dados.flows ?? []);
  const [criando, setCriando] = useState(false);
  /** Fluxos tirados da lista nesta sessão, para o Desfazer ficar ao alcance. */
  const [removidos, setRemovidos] = useState<RecordsView["flows"]>([]);
  const entregue = useRef(dados.flows ?? []);
  useEffect(() => {
    const novos = dados.flows ?? [];
    if (novos === entregue.current) return;
    entregue.current = novos;
    setFluxos(novos);
    // Um fluxo que voltou do servidor (desfazer) não está mais "removido".
    setRemovidos((antes) => {
      const naFicha = new Set(novos.map((f) => f.id));
      const ficam = antes.filter((f) => !naFicha.has(f.id));
      return ficam.length === antes.length ? antes : ficam;
    });
  }, [dados.flows]);

  const aplicar = (novos: RecordsView["flows"]) => {
    // Fluxos que saíram da lista ficam à vista para voltar atrás: são o único
    // jeito de alcançar o botão de um item que já não está na ficha.
    const ficaram = new Set(novos.map((f) => f.id));
    const sairam = fluxos.filter((f) => !ficaram.has(f.id));
    if (sairam.length) {
      const ids = new Set(sairam.map((f) => f.id));
      setRemovidos((antes) => [...sairam, ...antes.filter((f) => !ids.has(f.id))]);
    }
    // Um fluxo que voltou pelo Desfazer sai da lista de removidos.
    const voltaram = novos.filter((f) => removidos.some((r) => r.id === f.id));
    if (voltaram.length) {
      const ids = new Set(voltaram.map((f) => f.id));
      setRemovidos((antes) => antes.filter((f) => !ids.has(f.id)));
    }
    entregue.current = novos;
    setFluxos(novos);
    avisar();
    salvar.salvar("flows", { flows: novos });
  };

  async function criar(templateId?: string) {
    if (criando) return;
    setCriando(true);
    avisar();
    try {
      // Grava o que estiver em edição antes de buscar a lista nova do servidor,
      // para a releitura não apagar texto ainda não enviado.
      await salvar.salvarAgora();
      await api.post("/api/records/flows", templateId ? { templateId } : {});
      await recarregar();
    } catch {
      /* o aviso aparece no selo */
    } finally {
      setCriando(false);
    }
  }

  return (
    <div>
      <div className="ferramentas-ficha">
        <button type="button" className="btn primario" onClick={() => void criar()} disabled={criando}>
          {criando ? "Criando…" : "Novo fluxo"}
        </button>
        {FLOW_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="btn" onClick={() => void criar(t.id)} disabled={criando}>
            Usar modelo: {t.name}
          </button>
        ))}
      </div>
      <p className="legenda" style={{ margin: "10px 0 18px", maxWidth: "68ch" }}>
        Descreva o processo como ele acontece hoje, etapa por etapa. “Onde trava” é o que vira gargalo no relatório.
      </p>

      {fluxos.length === 0 ? (
        <div className="vazio">Nenhum fluxo criado. Comece com “Novo fluxo” ou com o modelo de bolsa de monitoria.</div>
      ) : null}

      {fluxos.map((f) => {
        const trocar = (mudanca: Partial<typeof f>) => aplicar(fluxos.map((x) => (x.id === f.id ? { ...x, ...mudanca } : x)));
        const trocarEtapa = (etapaId: string, campo: string, v: string) =>
          trocar({ steps: f.steps.map((s) => (s.id === etapaId ? { ...s, [campo]: v } : s)) });
        return (
          <section key={f.id} className="fluxo" aria-label={`Fluxo ${f.name || "sem nome"}`}>
            <header className="fluxo-cab">
              <div className="campo" style={{ flex: 1, minWidth: 240 }}>
                <label htmlFor={`fluxo-nome-${f.id}`}>Nome do fluxo</label>
                <CampoTexto rotulo="Nome do fluxo" valor={f.name} aoSalvar={(v) => trocar({ name: v })} />
              </div>
              <div className="acoes-linha" role="group" aria-label="Ações do fluxo">
                <BotaoConfirmavel
                  rotulo={`Remover o fluxo ${f.name || "sem nome"}`}
                  pergunta={`Remover o fluxo “${f.name || "sem nome"}”? As etapas dele saem do relatório.`}
                  acoes={["Remover fluxo", "Manter"]}
                  variante="btn sutil perigo"
                  aoConfirmar={() => aplicar(fluxos.filter((x) => x.id !== f.id))}
                >
                  Remover fluxo
                </BotaoConfirmavel>
                <BotaoDesfazer chave={chaveLinha("flows", f.id)} temCopia={copia(chaveLinha("flows", f.id))} rotulo={`o fluxo ${f.name || "sem nome"}`} />
              </div>
            </header>
            <div className="campo" style={{ marginBottom: 12 }}>
              <label htmlFor={`fluxo-proc-${f.id}`}>Processo</label>
              <CampoTexto rotulo="Processo" valor={f.process} aoSalvar={(v) => trocar({ process: v })} />
            </div>
            <p className="tabela-dica">Deslize para o lado para ver as outras colunas.</p>
      <div className="tabela-wrap" tabIndex={0} role="group" aria-label="Tabela da ficha. Em telas estreitas, deslize na horizontal para ver as outras colunas.">
              <table className="tabela-ficha tabela-fluxos">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 34 }}>
                      <span className="micro">#</span>
                    </th>
                    {FLOW_COLUMNS.map((c) => (
                      <th key={c.key} scope="col">
                        {c.label}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="micro">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {f.steps.map((s, i) => (
                    <tr key={s.id}>
                      <td className="num meta">{i + 1}</td>
                      {FLOW_COLUMNS.map((c) => (
                        <td key={c.key}>
                          <CampoTexto
                            rotulo={`${f.name}, etapa ${i + 1}, ${c.label}`}
                            valor={(s as unknown as Record<string, string>)[c.key] ?? ""}
                            aoSalvar={(v) => trocarEtapa(s.id, c.key, v)}
                          />
                        </td>
                      ))}
                      <td>
                        <BotaoConfirmavel
                          rotulo={`Remover etapa ${i + 1} de ${f.name || "fluxo"}`}
                          pergunta={`Remover a etapa ${i + 1}?`}
                          acoes={["Remover etapa", "Manter"]}
                          variante="btn sutil perigo"
                          aoConfirmar={() => trocar({ steps: f.steps.filter((x) => x.id !== s.id) })}
                        >
                          Remover
                        </BotaoConfirmavel>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() =>
                trocar({
                  steps: [...f.steps, { id: id(), stage: "", who: "", docSystem: "", deadline: "", blocker: "" }],
                })
              }
            >
              Adicionar etapa
            </button>
          </section>
        );
      })}
      {removidos.length ? (
        <section className="desfazer-removidos" aria-label="Fluxos removidos agora">
          <p className="micro">Removidos agora. Se foi engano, o fluxo volta inteiro pelos botões abaixo.</p>
          <ul>
            {removidos.map((f) => (
              <li key={f.id}>
                <span>{f.name || "Fluxo sem nome"}</span>
                <BotaoDesfazer chave={chaveLinha("flows", f.id)} temCopia={copia(chaveLinha("flows", f.id))} rotulo={`o fluxo removido ${f.name || "sem nome"}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Ficha4({ dados, salvar, copia }: { dados: RecordsView; salvar: Salvar; copia: (chave: string) => boolean }) {
  const avisar = useContext(AvisoEdicao);
  // Cópia local: adicionar e remover usam o estado da tela, não a foto do servidor.
  const [sistemas, setSistemas] = useState<RecordsView["systems"]>(() =>
    dados.systems?.length ? dados.systems : SYSTEM_INITIAL.map((s) => ({ id: s.id, name: s.name, fields: {} as Record<string, string> })),
  );
  /** Sistemas tirados da lista nesta sessão, para o Desfazer ficar ao alcance. */
  const [removidos, setRemovidos] = useState<RecordsView["systems"]>([]);
  const entregue = useRef(dados.systems ?? []);
  useEffect(() => {
    const novos = dados.systems ?? [];
    if (!novos.length || novos === entregue.current) return;
    entregue.current = novos;
    setSistemas(novos);
    setRemovidos((antes) => {
      const naFicha = new Set(novos.map((s) => s.id));
      const ficam = antes.filter((s) => !naFicha.has(s.id));
      return ficam.length === antes.length ? antes : ficam;
    });
  }, [dados.systems]);
  const gravar = (novos: RecordsView["systems"]) => {
    const ficaram = new Set(novos.map((s) => s.id));
    const sairam = sistemas.filter((s) => !ficaram.has(s.id));
    if (sairam.length) {
      const ids = new Set(sairam.map((s) => s.id));
      setRemovidos((antes) => [...sairam, ...antes.filter((s) => !ids.has(s.id))]);
    }
    entregue.current = novos;
    setSistemas(novos);
    avisar();
    salvar.salvar("systems", { systems: novos });
  };
  return (
    <div>
      <p className="legenda" style={{ marginBottom: 16, maxWidth: "68ch" }}>
        Um bloco por sistema. Preencha o que você conseguiu confirmar; o que ficou em dúvida pode ser escrito como dúvida.
      </p>
      {sistemas.map((s) => (
        <section key={s.id} className="sistema" aria-label={`Sistema ${s.name}`}>
          <header className="fluxo-cab">
            <div className="campo" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor={`sis-${s.id}`}>Sistema</label>
              <CampoTexto
                rotulo="Nome do sistema"
                valor={s.name}
                aoSalvar={(v) => (avisar(), gravar(sistemas.map((x) => (x.id === s.id ? { ...x, name: v } : x))))}
              />
            </div>
            {/* As ações ficam na própria linha do bloco, alinhadas à direita, sem
                disputar espaço com o nome do sistema. */}
            <div className="acoes-linha" role="group" aria-label="Ações do sistema">
              <BotaoDesfazer chave={chaveLinha("systems", s.id)} temCopia={copia(chaveLinha("systems", s.id))} rotulo={`o sistema ${s.name || "sem nome"}`} />
              <BotaoConfirmavel
                rotulo={`Remover o sistema ${s.name || "sem nome"}`}
                pergunta={`Remover o sistema “${s.name || "sem nome"}”?`}
                acoes={["Remover sistema", "Manter"]}
                variante="btn sutil perigo"
                aoConfirmar={() => gravar(sistemas.filter((x) => x.id !== s.id))}
              >
                Remover sistema
              </BotaoConfirmavel>
            </div>
          </header>
          <dl className="campos-ficha dois">
            {SYSTEM_FIELDS.map((f) => (
              <div key={f.key} className={f.key === "oQueEntra" || f.key === "oQueSai" ? "largo" : undefined}>
                <dt>
                  <label htmlFor={`sis-${s.id}-${f.key}`}>{f.label}</label>
                </dt>
                <dd>
                  <CampoTexto
                    rotulo={`${s.name}, ${f.label}`}
                    valor={s.fields?.[f.key] ?? ""}
                    multilinha
                    aoSalvar={(v) =>
                      gravar(sistemas.map((x) => (x.id === s.id ? { ...x, fields: { ...x.fields, [f.key]: v } } : x)))
                    }
                  />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => (avisar(), gravar([...sistemas, { id: id(), name: "", fields: {} }]))}
      >
        Adicionar sistema
      </button>
      {removidos.length ? (
        <section className="desfazer-removidos" aria-label="Sistemas removidos agora">
          <p className="micro">Removidos agora. Se foi engano, o sistema volta inteiro pelos botões abaixo.</p>
          <ul>
            {removidos.map((s) => (
              <li key={s.id}>
                <span>{s.name || "Sistema sem nome"}</span>
                <BotaoDesfazer chave={chaveLinha("systems", s.id)} temCopia={copia(chaveLinha("systems", s.id))} rotulo={`o sistema removido ${s.name || "sem nome"}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Ficha5({ dados, salvar, copia }: { dados: RecordsView; salvar: Salvar; copia: (chave: string) => boolean }) {
  const avisar = useContext(AvisoEdicao);
  const [padrao] = useState<RecordsView["procedures"]>(() =>
    PROCEDURES_INITIAL.map((p) => ({ ...p, responsible: "", deadline: p.deadline ?? "" })),
  );
  const [linhas, setLinhas] = useState<RecordsView["procedures"]>(dados.procedures?.length ? dados.procedures : padrao);
  const vazio = useRef(!dados.procedures?.length);
  const entregue = useRef(dados.procedures ?? []);
  useEffect(() => {
    const novos = dados.procedures ?? [];
    if (novos === entregue.current || (!novos.length && vazio.current)) return;
    entregue.current = novos;
    vazio.current = !novos.length;
    setLinhas(novos);
  }, [dados.procedures]);
  const gravar = (novas: RecordsView["procedures"]) => {
    entregue.current = novas;
    vazio.current = false;
    setLinhas(novas);
    avisar();
    salvar.salvar("procedures", { procedures: novas });
  };
  return (
    <div>
      <p className="legenda" style={{ marginBottom: 12, maxWidth: "68ch" }}>
        Para cada procedimento, registre a norma que o sustenta (documento, número e ano), quem responde e qual é o prazo. O
        responsável é preenchido por você.
      </p>
      <p className="tabela-dica">Deslize para o lado para ver as outras colunas.</p>
      <div className="tabela-wrap" tabIndex={0} role="group" aria-label="Tabela da ficha. Em telas estreitas, deslize na horizontal para ver as outras colunas."> <table className="tabela-ficha tabela-procedimentos">
          <thead>
            <tr>
              {PROCEDURE_COLUMNS.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="micro">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p, i) => (
              <tr key={p.id}>
                {PROCEDURE_COLUMNS.map((c) => {
                  const travado = c.key === "base" && (p as unknown as { fixedBase?: boolean }).fixedBase;
                  const nota = (p as unknown as { note?: string }).note;
                  return (
                    <td key={c.key}>
                      {travado ? (
                        <span>
                          {p.base}
                          <span className="micro"> · fixo</span>
                        </span>
                      ) : (
                        <CampoTexto
                          rotulo={`${p.procedure}, ${c.label}`}
                          valor={(p as unknown as Record<string, string>)[c.key] ?? ""}
                          aoSalvar={(v) => (avisar(), gravar(linhas.map((x) => (x.id === p.id ? { ...x, [c.key]: v } : x))))}
                        />
                      )}
                      {c.key === "procedure" && nota ? <span className="micro"> · confirmar com a coordenação</span> : null}
                    </td>
                  );
                })}
                <td>
                  <BotaoDesfazer
                    chave={chaveLinha("procedures", p.id)}
                    temCopia={copia(chaveLinha("procedures", p.id))}
                    rotulo={`o procedimento ${p.procedure || i + 1}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="micro" style={{ marginTop: 10 }}>
        Linhas em ordem fixa. Se faltar um procedimento, registre-o no diário de campo (ficha 7).
      </p>
    </div>
  );
}

function Ficha6({
  dados,
  salvar,
  copia,
}: {
  dados: RecordsView;
  salvar: Salvar;
  copia: (chave: string) => boolean;
}) {
  const avisar = useContext(AvisoEdicao);
  // Um estado só para a ficha inteira: o 5W2H vem antes do PDCA, e o segundo
  // não pode partir de valores velhos do primeiro.
  const [imp, setImp] = useState<RecordsView["improvement"]>(() => {
    const base = dados.improvement ?? { idea: "", fiveW2H: {}, pdca: {} };
    return Object.keys(base.fiveW2H ?? {}).length ? base : { ...base, fiveW2H: FIVE_W2H_INITIAL };
  });
  const entregue = useRef(dados.improvement);
  useEffect(() => {
    if (!dados.improvement || dados.improvement === entregue.current) return;
    entregue.current = dados.improvement;
    setImp(Object.keys(dados.improvement.fiveW2H ?? {}).length ? dados.improvement : { ...dados.improvement, fiveW2H: FIVE_W2H_INITIAL });
  }, [dados.improvement]);
  const w2h = imp.fiveW2H ?? {};
  const pdca = imp.pdca ?? {};
  // A ficha 6 é uma peça só: cada campo tem cópia própria e a volta atrás
  // devolve só aquele campo, sem mexer no resto.
  const copiaCampo = (campo: string) => copia(chaveCampo("improvement", campo));
  const desfazer = (campo: string, rotulo: string) => (
    <div className="acoes-linha">
      <BotaoDesfazer chave={chaveCampo("improvement", campo)} temCopia={copiaCampo(campo)} rotulo={rotulo} />
    </div>
  );
  const gravar = (mudanca: Partial<typeof imp>) => {
    const novo = { ...imp, ...mudanca };
    entregue.current = novo;
    setImp(novo);
    avisar();
    salvar.salvar("improvement", { idea: novo.idea, fiveW2H: novo.fiveW2H, pdca: novo.pdca });
  };
  return (
    <div>
      <div className="campo" style={{ marginBottom: 20 }}>
        <label htmlFor="f6-ideia">Ideia de melhoria</label>
        <CampoTexto rotulo="Ideia de melhoria" valor={imp.idea} aoSalvar={(v) => (avisar(), gravar({ idea: v }))} placeholder="Ex.: canal no WhatsApp com editais e projetos" />
        {desfazer("idea", "a ideia de melhoria")}
      </div>

      <h2 className="secao" style={{ marginBottom: 4 }}>
        5W2H
      </h2>
      <p className="micro" style={{ marginBottom: 10 }}>
        Cada resposta precisa de um fato. O que ainda não se sabe fica marcado para decidir com a coordenação.
      </p>
      <dl className="campos-ficha dois">
        {FIVE_W2H_KEYS.map((k) => (
          <div key={k.key} className={k.key === "como" || k.key === "porQue" ? "largo" : undefined}>
            <dt>
              <label htmlFor={`f6-${k.key}`}>{k.label}</label>
            </dt>
            <dd>
              <CampoTexto rotulo={k.label} valor={w2h[k.key] ?? ""} multilinha aoSalvar={(v) => (avisar(), gravar({ fiveW2H: { ...w2h, [k.key]: v } }))} />
              {desfazer(`fiveW2H.${k.key}`, `${k.label}, no 5W2H`)}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="secao" style={{ margin: "26px 0 10px" }}>
        PDCA
      </h2>
      <div className="pdca">
        {PDCA_KEYS.map((k) => (
          <div key={k.key} className="campo">
            <label htmlFor={`f6-pdca-${k.key}`}>{k.label}</label>
            <CampoTexto rotulo={k.label} valor={pdca[k.key] ?? ""} multilinha aoSalvar={(v) => (avisar(), gravar({ pdca: { ...pdca, [k.key]: v } }))} placeholder={PLACEHOLDER} />
            {desfazer(`pdca.${k.key}`, `${k.label}, no PDCA`)}
          </div>
        ))}
      </div>
      <p className="micro" style={{ marginTop: 10 }}>
        Em “Checar”, anote como vai medir o efeito (o que conta, quanto antes e quanto depois).
      </p>
    </div>
  );
}

function Ficha7({ dados, salvar, copia }: { dados: RecordsView; salvar: Salvar; copia: (chave: string) => boolean }) {
  const avisar = useContext(AvisoEdicao);
  const [linhas, setLinhas] = useState<RecordsView["diary"]>(dados.diary ?? []);
  /** Registros tirados da lista nesta sessão: continuam à mão para o Desfazer. */
  const [removidos, setRemovidos] = useState<RecordsView["diary"]>([]);
  const entregue = useRef(dados.diary ?? []);
  useEffect(() => {
    const novos = dados.diary ?? [];
    if (novos === entregue.current) return;
    entregue.current = novos;
    setLinhas(novos);
    setRemovidos((antes) => {
      const naFicha = new Set(novos.map((r) => r.id));
      const ficam = antes.filter((r) => !naFicha.has(r.id));
      return ficam.length === antes.length ? antes : ficam;
    });
  }, [dados.diary]);
  const gravar = (novas: RecordsView["diary"]) => {
    const ficaram = new Set(novas.map((r) => r.id));
    const sairam = linhas.filter((r) => !ficaram.has(r.id));
    if (sairam.length) {
      const ids = new Set(sairam.map((r) => r.id));
      setRemovidos((antes) => [...sairam, ...antes.filter((r) => !ids.has(r.id))]);
    }
    entregue.current = novas;
    setLinhas(novas);
    avisar();
    salvar.salvar("diary", { rows: novas });
  };
  return (
    <div>
      <p className="legenda" style={{ marginBottom: 12, maxWidth: "68ch" }}>
        Um registro por observação. A fonte pode ser uma conversa, um documento ou uma tela do sistema. A dúvida fica para você
        resolver na próxima visita.
      </p>
      {linhas.length === 0 ? (
        <p className="vazio" style={{ marginBottom: 12 }}>
          Ainda sem registros. Comece pelo primeiro que abrir a linha do diário.
        </p>
      ) : (
        <>
        <p className="tabela-dica">Deslize para o lado para ver as outras colunas.</p>
      <div className="tabela-wrap" tabIndex={0} role="group" aria-label="Tabela da ficha. Em telas estreitas, deslize na horizontal para ver as outras colunas."> <table className="tabela-ficha tabela-diario">
            <thead>
              <tr>
                {DIARY_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={`col-${c.key}`}>
                    {c.label}
                  </th>
                ))}
                <th scope="col">
                  <span className="micro">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r, i) => (
                <tr key={r.id}>
                  {DIARY_COLUMNS.map((c) => (
                    <td key={c.key}>
                      {c.kind === "long" || c.key === "source" ? (
                        <CampoTexto
                          rotulo={`registro ${i + 1}, ${c.label}`}
                          valor={(r as unknown as Record<string, string>)[c.key] ?? ""}
                          multilinha
                          aoSalvar={(v) => (avisar(), gravar(linhas.map((x) => (x.id === r.id ? { ...x, [c.key]: v } : x))))}
                        />
                      ) : (
                        <CampoTexto
                          rotulo={`registro ${i + 1}, ${c.label}`}
                          tipo={c.kind === "date" ? "date" : "text"}
                          classe={c.kind === "date" ? "campo-data" : undefined}
                          valor={(r as unknown as Record<string, string>)[c.key] ?? ""}
                          aoSalvar={(v) => (avisar(), gravar(linhas.map((x) => (x.id === r.id ? { ...x, [c.key]: v } : x))))}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="acoes-linha">
                      <BotaoConfirmavel
                        rotulo={`Remover registro ${i + 1}`}
                        pergunta={`Remover o registro ${i + 1}? Ele sai do diário e do relatório. Dá para voltar atrás em seguida.`}
                        acoes={["Remover registro", "Manter"]}
                        variante="btn sutil perigo"
                        aoConfirmar={() => gravar(linhas.filter((x) => x.id !== r.id))}
                      >
                        Remover
                      </BotaoConfirmavel>
                      <BotaoDesfazer chave={chaveLinha("diary", r.id)} temCopia={copia(chaveLinha("diary", r.id))} rotulo={`o registro ${i + 1}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {removidos.length ? (
        <section className="desfazer-removidos" aria-label="Registros removidos agora">
          <p className="micro">Removidos agora. Se foi engano, o registro volta com uma data, a observação e a fonte.</p>
          <ul>
            {removidos.map((r, i) => (
              <li key={r.id}>
                <span>{r.observation.trim().slice(0, 60) || r.date || `Registro ${i + 1}`}</span>
                <BotaoDesfazer chave={chaveLinha("diary", r.id)} temCopia={copia(chaveLinha("diary", r.id))} rotulo={`o registro removido ${i + 1}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => (avisar(), gravar([...linhas, { id: id(), date: new Date().toISOString().slice(0, 10), observation: "", source: "", question: "" }]))}
      >
        Adicionar registro
      </button>

      <h2 className="secao" style={{ margin: "26px 0 4px" }}>
        Roteiro de entrevista
      </h2>
      <p className="micro" style={{ marginBottom: 10 }}>
        Referência para não esquecer de perguntar. As respostas entram no diário acima.
      </p>
      <div className="roteiro">
        {INTERVIEW_GUIDE.map((g) => (
          <div key={g.tool} className="roteiro-item">
            <span className="micro">{g.phase}</span>
            <strong>{g.tool}</strong>
            <p className="legenda">{g.question}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ficha8({ dados, salvar, copia }: { dados: RecordsView; salvar: Salvar; copia: (chave: string) => boolean }) {
  const avisar = useContext(AvisoEdicao);
  const [locais] = useState(() => GLOSSARY_INITIAL.map((g) => ({ id: id(), ...g })));
  const [linhas, setLinhas] = useState<RecordsView["glossary"]>(dados.glossary?.length ? dados.glossary : locais);
  /** Verbetes tirados da lista nesta sessão: continuam à mão para o Desfazer. */
  const [removidos, setRemovidos] = useState<RecordsView["glossary"]>([]);
  const entregue = useRef(dados.glossary?.length ? dados.glossary : locais);
  useEffect(() => {
    const novos = dados.glossary ?? [];
    if (!novos.length || novos === entregue.current) return;
    entregue.current = novos;
    setLinhas(novos);
    setRemovidos((antes) => {
      const naFicha = new Set(novos.map((r) => r.id));
      const ficam = antes.filter((r) => !naFicha.has(r.id));
      return ficam.length === antes.length ? antes : ficam;
    });
  }, [dados.glossary]);
  const gravar = (novas: RecordsView["glossary"]) => {
    const ficaram = new Set(novas.map((r) => r.id));
    const sairam = linhas.filter((r) => !ficaram.has(r.id));
    if (sairam.length) {
      const ids = new Set(sairam.map((r) => r.id));
      setRemovidos((antes) => [...sairam, ...antes.filter((r) => !ids.has(r.id))]);
    }
    entregue.current = novas;
    setLinhas(novas);
    avisar();
    salvar.salvar("glossary", { rows: novas });
  };
  return (
    <div>
      <p className="tabela-dica">Deslize para o lado para ver as outras colunas.</p>
      <div className="tabela-wrap" tabIndex={0} role="group" aria-label="Tabela da ficha. Em telas estreitas, deslize na horizontal para ver as outras colunas."> <table className="tabela-ficha tabela-glossario">
          <thead>
            <tr>
              {GLOSSARY_COLUMNS.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="micro">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => (
              <tr key={r.id}>
                {GLOSSARY_COLUMNS.map((c) => (
                  <td key={c.key}>
                    <CampoTexto
                      rotulo={`verbete ${i + 1}, ${c.label}`}
                      valor={(r as unknown as Record<string, string>)[c.key] ?? ""}
                      aoSalvar={(v) => (avisar(), gravar(linhas.map((x) => (x.id === r.id ? { ...x, [c.key]: v } : x))))}
                    />
                  </td>
                ))}
                <td>
                  <div className="acoes-linha">
                    <BotaoConfirmavel
                      rotulo={`Remover verbete ${i + 1}`}
                      pergunta={`Remover o verbete ${i + 1}? Dá para voltar atrás em seguida.`}
                      acoes={["Remover verbete", "Manter"]}
                      variante="btn sutil perigo"
                      aoConfirmar={() => gravar(linhas.filter((x) => x.id !== r.id))}
                    >
                      Remover
                    </BotaoConfirmavel>
                    <BotaoDesfazer chave={chaveLinha("glossary", r.id)} temCopia={copia(chaveLinha("glossary", r.id))} rotulo={`o verbete ${i + 1}`} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => (avisar(), gravar([...linhas, { id: id(), acronym: "", meaning: "", source: "" }]))}
      >
        Adicionar sigla
      </button>
      {removidos.length ? (
        <section className="desfazer-removidos" aria-label="Verbetes removidos agora">
          <p className="micro">Removidos agora. Se foi engano, o verbete volta inteiro pelos botões abaixo.</p>
          <ul>
            {removidos.map((r, i) => (
              <li key={r.id}>
                <span>{r.acronym || r.meaning.slice(0, 40) || `Verbete ${i + 1}`}</span>
                <BotaoDesfazer chave={chaveLinha("glossary", r.id)} temCopia={copia(chaveLinha("glossary", r.id))} rotulo={`o verbete removido ${r.acronym || i + 1}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

