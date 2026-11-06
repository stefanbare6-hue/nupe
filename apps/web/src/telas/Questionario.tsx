import { useEffect, useMemo, useRef, useState } from "react";
import type { Question } from "@nupe/core";
import { chaveOutro, LIMITE_OUTRO } from "@nupe/core";
import { api, ApiError, idDaSessao } from "../lib/http";
import { IconeCheck, IconePessoa } from "../componentes/Icones";
import { aplicarTamanho, BarraTopo, BotoesTexto, tamanhoAtual, type Passo } from "../componentes/BarraTopo";
import { irPara } from "../lib/rotas";

interface PublicSurvey {
  audience: string;
  title: string;
  intro: string;
  questions: Question[];
  status: "aberta" | "encerrada" | "indisponivel";
  closesAt: string | null;
}

type Valores = Record<string, string | string[] | number | null>;

const ESCALA = [1, 2, 3, 4, 5];
const numerais = [1, 2, 3, 4, 5];

/** "Questionário - Docentes" vira "Docentes"; o rótulo do público volta ao topo. */
function publicoDoTitulo(titulo: string): string {
  return (titulo.replace(/^question[aá]rio\s*[-–:]\s*/i, "").split(":")[0] ?? "").trim() || titulo;
}

/** Títulos por público, sem cobrança: o texto fala de apoio e de rotina. */
const CHAMADA: Record<string, string> = {
  docentes: "como o NUPE pode apoiar melhor a rotina de pesquisa e extensão",
  estudantes: "como o NUPE pode chegar mais perto de você",
  equipe: "como a rotina do núcleo pode funcionar melhor",
};

export function QuestionarioPublico({ publicId }: { publicId: string }) {
  const [dados, setDados] = useState<PublicSurvey | null | "vazio">(null);
  const [erroCarga, setErroCarga] = useState("");
  const [valores, setValores] = useState<Valores>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [jaRespondeu, setJaRespondeu] = useState(false);
  const [recibo, setRecibo] = useState<"checando" | "pode" | "respondeu">("checando");
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/surveys/${encodeURIComponent(publicId)}`)
      .then((r) => r.json())
      .then((d: { survey: PublicSurvey | null }) => {
        if (!vivo) return;
        if (!d.survey) setDados("vazio");
        else {
          setDados(d.survey);
          document.title = `${d.survey.title} · NUPE`;
        }
      })
      .catch(() => vivo && setErroCarga("Não foi possível abrir o questionário. Verifique a conexão e recarregue a página."));
    // O aparelho pergunta se já respondeu antes de a pessoa preencher tudo: com
    // a página recarregada ou o cookie limpo, só o envio no fim não bastava.
    api
      .post<{ respondido?: boolean }>(`/api/public/surveys/${encodeURIComponent(publicId)}/recibo`, { sessionId: idDaSessao() })
      .then((r) => vivo && setRecibo(r?.respondido ? "respondeu" : "pode"))
      .catch(() => vivo && setRecibo("pode"));
    return () => {
      vivo = false;
    };
  }, [publicId]);

  const survey = dados && dados !== "vazio" ? dados : null;

  const respondidas = useMemo(() => {
    if (!survey) return 0;
    return survey.questions.filter((q) => {
      if (!vazio(valores[q.id], q)) return true;
      const outro = valores[chaveOutro(q.id)];
      return typeof outro === "string" && outro.trim() !== "";
    }).length;
  }, [survey, valores]);

  function definir(id: string, v: string | string[] | number | null) {
    setValores((atual) => ({ ...atual, [id]: v }));
    setErros((e) => {
      if (!e[id]) return e;
      const resto = { ...e };
      delete resto[id];
      return resto;
    });
  }

  function alternarMulti(q: Question, code: string) {
    const atual = Array.isArray(valores[q.id]) ? (valores[q.id] as string[]) : [];
    const marcado = atual.includes(code);
    let proximo: string[];
    if (q.options?.some((o) => o.code === "nenhum")) {
      if (code === "nenhum") proximo = marcado ? [] : ["nenhum"];
      else proximo = [...atual.filter((c) => c !== "nenhum"), ...(marcado ? [] : [code])];
    } else {
      proximo = marcado ? atual.filter((c) => c !== code) : [...atual, code];
    }
    definir(q.id, proximo);
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    for (const q of survey!.questions) {
      if (q.optional) continue;
      const escolhido = !vazio(valores[q.id], q);
      const outro = valores[chaveOutro(q.id)];
      const escrito = typeof outro === "string" ? outro.trim() : "";
      if (escrito.length > LIMITE_OUTRO) {
        novos[q.id] = `O texto da pergunta ${q.number} passou de ${LIMITE_OUTRO} caracteres.`;
        continue;
      }
      if (!escolhido && !escrito) novos[q.id] = `Escolha uma resposta ou escreva na pergunta ${q.number}.`;
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar() {
    if (!survey || !validar()) {
      topo.current?.scrollIntoView({ block: "start" });
      const primeiro = document.querySelector<HTMLElement>("[aria-invalid='true']");
      if (primeiro) {
        const alvo = primeiro.closest("fieldset")?.querySelector<HTMLElement>("input, textarea") ?? primeiro;
        alvo.focus();
      } else document.getElementById("resumo-erros")?.focus();
      return;
    }
    setEnviando(true);
    setFalha("");
    try {
      // Pedido de envio (prova curta) e envio em seguida. Sem a prova o servidor
      // recusa o pedido; ela nasce antes do envio para um robô não conseguir
      // montar a resposta direto.
      const id = idDaSessao();
      const { proof } = await api.post<{ proof: string }>("/api/public/surveys/contest", {
        collectionPublicId: publicId,
        sessionId: id,
      });
      await api.post(`/api/public/surveys/${encodeURIComponent(publicId)}/responses`, {
        sessionId: id,
        proof,
        answers: valores,
      });
      setConcluido(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Este aparelho já respondeu (outra aba, ou antes de recarregar). A
        // coleta continua aberta: o recado fica no topo e o botão desliga.
        setJaRespondeu(true);
        setFalha(
          "Este aparelho já enviou uma resposta a este questionário. Se foi outra pessoa no mesmo aparelho, peça o link para ela responder no celular dela.",
        );
        window.scrollTo({ top: 0 });
        return;
      }
      if (e instanceof ApiError) {
        setFalha(e.message);
        return;
      }
      setFalha("Não foi possível enviar. Verifique a conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (erroCarga)
    return (
      <Tela mensagem="Questionário indisponível">
        <p className="legenda" style={{ marginTop: 8 }}>
          {erroCarga}
        </p>
      </Tela>
    );

  if (dados === "vazio")
    return (
      <Tela mensagem="Este link não está disponível">
        <p className="legenda" style={{ marginTop: 8 }}>
          O endereço pode estar incompleto ou a coleta foi removida. Peça novamente o link ao responsável pelo NUPE.
        </p>
      </Tela>
    );

  if ((jaRespondeu || recibo === "respondeu") && survey)
    return (
      <Tela
        mensagem="Este aparelho já respondeu"
        icone={
          <span className="icone-circulo" aria-hidden="true">
            <IconeCheck size={24} />
          </span>
        }
      >
        <p className="legenda" style={{ marginTop: 8, maxWidth: "58ch" }} role="alert">
          {falha ||
            "A resposta deste aparelho já está registrada. Se foi outra pessoa no mesmo aparelho, peça o link para ela responder no celular dela."}
        </p>
      </Tela>
    );

  if (dados === null || recibo === "checando")
    return (
      <div className="q-tela">
        <BarraTopo aberta={false} aoAlternarMenu={() => undefined} aoFechar={() => undefined} />
        <div className="q-aviso">
          <p className="legenda" role="status">
            Carregando questionário…
          </p>
        </div>
      </div>
    );

  if (concluido)
    return (
      <Tela
        mensagem="Resposta registrada"
        icone={
          <span className="icone-circulo" aria-hidden="true">
            <IconeCheck size={24} />
          </span>
        }
      >
        <p className="legenda" style={{ marginTop: 8, maxWidth: "58ch" }}>
          Obrigado(a) por participar. Sua resposta foi gravada de forma anônima e não pode ser identificada. Pode fechar esta
          página.
        </p>
      </Tela>
    );

  if (survey!.status !== "aberta")
    return (
      <Tela mensagem={survey!.status === "encerrada" ? "Esta coleta foi encerrada" : "Esta coleta ainda não começou"}>
        <p className="legenda" style={{ marginTop: 8, maxWidth: "58ch" }}>
          {survey!.status === "encerrada"
            ? "As respostas recebidas até o encerramento continuam valendo para o relatório do estágio."
            : "O link já existe, mas a coleta está pausada. Tente novamente mais tarde."}
        </p>
      </Tela>
    );

  const opcionais = survey!.questions.filter((q) => q.optional).length;
  const quantosErros = Object.keys(erros).length;
  const publico = publicoDoTitulo(survey!.title);

  return (
    <div className="q-tela" ref={topo}>
      <BarraPublica respondidas={respondidas} total={survey!.questions.length} />

      <div className="q-coluna">
        <section className="painel q-abertura" aria-labelledby="q-titulo">
          <p className="q-etiqueta">{survey!.title}</p>
          <h1 id="q-titulo" className="titulo">
            {publico}: {CHAMADA[survey!.audience] ?? "como o NUPE pode apoiar você"}
          </h1>
          <p className="legenda texto-intro">{survey!.intro}</p>
          <ul className="fatos-resposta" aria-label="Sobre o questionário">
            <li>
              <b>{respondidas}</b> de {survey!.questions.length} perguntas respondidas
              {opcionais ? ` (${opcionais} opcional${opcionais > 1 ? "is" : ""})` : ""}
            </li>
            <li>Anônimo: não pede nome, e-mail nem telefone</li>
            <li>Leva de 3 a 5 minutos</li>
          </ul>
        </section>

        {falha || quantosErros ? (
          <div id="resumo-erros" className="aviso" role="alert" tabIndex={-1}>
            <span>
              <b>{falha || "Faltam respostas obrigatórias."}</b>
              {quantosErros ? ` Revise as perguntas destacadas abaixo.` : ""}
            </span>
          </div>
        ) : null}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <h2 className="titulo-secao" style={{ marginTop: 0 }}>
            Perguntas
          </h2>
          <ol className="perguntas">
            {survey!.questions.map((q) => (
              <li key={q.id}>
                <Pergunta
                  q={q}
                  valor={valores[q.id] ?? null}
                  outro={typeof valores[chaveOutro(q.id)] === "string" ? (valores[chaveOutro(q.id)] as string) : ""}
                  erro={erros[q.id]}
                  aoMudar={(v) => definir(q.id, v)}
                  aoEscrever={(t) => definir(chaveOutro(q.id), t)}
                  aoAlternar={(c) => alternarMulti(q, c)}
                />
              </li>
            ))}
          </ol>

          <section className="painel q-fecho" aria-labelledby="q-fecho-t" style={{ marginTop: "var(--gap)" }}>
            <div className="secao-cab" style={{ marginBottom: 0 }}>
              <h2 id="q-fecho-t" className="secao">
                Enviar
              </h2>
            </div>
            <p className="legenda" style={{ maxWidth: "56ch" }}>
              Ao enviar, a resposta é gravada sem qualquer dado que identifique você. Cada aparelho envia uma resposta por
              questionário.
            </p>
            <button className="btn primario" type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar respostas"}
            </button>
            <p className="micro">
              {respondidas} de {survey!.questions.length} perguntas respondidas
            </p>
          </section>
        </form>
      </div>
    </div>
  );
}

/** Tela curta: barra do topo e um cartão estreito no meio. */
function Tela({ mensagem, icone, children }: { mensagem: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="q-tela">
      <BarraPublica respondidas={0} total={0} />
      <div className="q-aviso">
        <section className="painel q-curto" aria-labelledby="q-aviso-t">
          {icone ?? null}
          <h1 id="q-aviso-t" className="titulo">
            {mensagem}
          </h1>
          {children}
        </section>
      </div>
    </div>
  );
}

/** Lado direito da barra no questionário: só o tamanho do texto e a entrada da estagiária. */
function LadoSimples() {
  const [passo, setPasso] = useState<Passo>(() => tamanhoAtual());
  return (
    <>
      <div className="texto-controle">
        <span id="rotulo-texto-q">Tamanho do texto</span>
        <BotoesTexto
          passo={passo}
          rotuloId="rotulo-texto-q"
          aoEscolher={(p) => {
            setPasso(p);
            aplicarTamanho(p);
          }}
        />
      </div>
      <a
        className="btn sutil"
        href="/entrar"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          irPara("/entrar");
        }}
      >
        <IconePessoa size={17} />
        Área do estagiário
      </a>
    </>
  );
}

/** Barra do topo do questionário.
 *
 *  No computador mostra o tamanho do texto e a entrada da estagiária. No celular
 *  esses dois vão para o menu, aberto pelo botão da barra, e o menu também ganha
 *  o convite para conferir as respostas enquanto a pessoa não começa. */
function BarraPublica({ respondidas, total }: { respondidas: number; total: number }) {
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<Passo>(() => tamanhoAtual());

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
    };
  }, [aberto]);

  return (
    <>
      <BarraTopo
        aberta={aberto}
        aoAlternarMenu={() => setAberto((v) => !v)}
        aoFechar={() => setAberto(false)}
        lado={<LadoSimples />}
      />
      <div id="navegacao" className={"q-menu" + (aberto ? " aberto" : "")} hidden={!aberto}>
        <div className="texto-controle">
          <span id="rotulo-texto-q2">Tamanho do texto</span>
          <BotoesTexto
            passo={passo}
            rotuloId="rotulo-texto-q2"
            aoEscolher={(p) => {
              setPasso(p);
              aplicarTamanho(p);
            }}
          />
        </div>
        <p className="legenda">
          {total === 0
            ? ""
            : respondidas === 0
              ? "Você ainda não respondeu nenhuma pergunta. "
              : `${respondidas} de ${total} perguntas respondidas. `}
          O questionário só é gravado quando você toca em "Enviar respostas".
        </p>
        <a
          className="nav-item"
          href="/entrar"
          onClick={(e) => {
            e.preventDefault();
            setAberto(false);
            irPara("/entrar");
          }}
        >
          Área do estagiário
        </a>
      </div>
    </>
  );
}

function vazio(v: string | string[] | number | null | undefined, q: Question): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (q.type === "scale") return !ESCALA.includes(v as number);
  return false;
}

function Pergunta({
  q,
  valor,
  outro,
  erro,
  aoMudar,
  aoEscrever,
  aoAlternar,
}: {
  q: Question;
  valor: string | string[] | number | null;
  outro: string;
  erro?: string;
  aoMudar: (v: string | string[] | number | null) => void;
  aoEscrever: (t: string) => void;
  aoAlternar: (code: string) => void;
}) {
  const nome = `p${q.number}`;
  const idTexto = `${nome}-texto`;
  return (
    <fieldset
      className={"q-cartao" + (erro ? " com-erro" : "")}
      aria-describedby={erro ? `${nome}-erro` : q.optional ? `${nome}-opc` : undefined}
    >
      <header>
        <span className="pergunta-num" aria-hidden="true">
          {q.number}
        </span>
        <legend id={idTexto} className="pergunta-texto">
          {q.text}
          {q.optional ? (
            <span className="opcional" id={`${nome}-opc`}>
              opcional
            </span>
          ) : null}
        </legend>
        {q.hint ? <p className="micro">{q.hint}</p> : null}
      </header>

      {q.type === "single" ? (
        <div className="opcoes">
          {q.options!.map((o) => (
            <label key={o.code} className={"opcao" + (valor === o.code ? " marcada" : "")}>
              <input
                type="radio"
                name={nome}
                value={o.code}
                checked={valor === o.code}
                aria-invalid={erro ? true : undefined}
                onChange={() => aoMudar(o.code)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {q.type === "multi" ? (
        <div className="opcoes">
          {q.options!.map((o) => {
            const marcada = Array.isArray(valor) && valor.includes(o.code);
            return (
              <label key={o.code} className={"opcao" + (marcada ? " marcada" : "")}>
                <input
                  type="checkbox"
                  value={o.code}
                  checked={marcada}
                  aria-invalid={erro ? true : undefined}
                  onChange={() => aoAlternar(o.code)}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
          <p className="micro">Pode marcar mais de uma opção.</p>
        </div>
      ) : null}

      {q.type === "scale" ? (
        <div className="escala">
          <div className="escala-notas" aria-hidden="true">
            <span>{q.scale?.minLabel}</span>
            <span>{q.scale?.maxLabel}</span>
          </div>
          <div className="escala-botoes" role="radiogroup" aria-label={q.text}>
            {numerais.map((n) => (
              <label key={n} className={"escala-botao" + (valor === n ? " marcada" : "")}>
                <input
                  type="radio"
                  name={nome}
                  value={n}
                  checked={valor === n}
                  aria-invalid={erro ? true : undefined}
                  onChange={() => aoMudar(n)}
                />
                {n}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {q.type === "open" ? (
        <>
          <textarea
            className="input"
            rows={4}
            maxLength={1200}
            aria-label={q.text}
            aria-invalid={erro ? true : undefined}
            placeholder="Escreva aqui. Não inclua dados pessoais, seus ou de outra pessoa."
            value={typeof valor === "string" ? valor : ""}
            onChange={(e) => aoMudar(e.target.value)}
          />
          <p className="micro">{(typeof valor === "string" ? valor.length : 0)}/1200</p>
        </>
      ) : null}

      {q.outro ? (
        <div className="campo-outro">
          <label htmlFor={`${nome}-outro`}>
            Não achou a opção? Escreva aqui
            <span className="opcional">opcional</span>
          </label>
          <textarea
            id={`${nome}-outro`}
            className="input"
            rows={2}
            maxLength={LIMITE_OUTRO}
            placeholder="Se a sua resposta não está na lista, escreva com suas palavras."
            value={outro}
            onChange={(e) => aoEscrever(e.target.value)}
          />
          {outro.length > 0 ? <p className="micro">{outro.length}/{LIMITE_OUTRO}</p> : null}
        </div>
      ) : null}

      {erro ? (
        <p id={`${nome}-erro`} className="erro-texto" role="alert">
          {erro}
        </p>
      ) : null}
    </fieldset>
  );
}
