import { useEffect, useMemo, useRef, useState } from "react";
import type { Question } from "@nupe/core";
import { api, ApiError, idDaSessao } from "../lib/http";
import { Marca } from "../componentes/Icones";

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

export function QuestionarioPublico({ publicId }: { publicId: string }) {
  const [dados, setDados] = useState<PublicSurvey | null | "vazio">(null);
  const [erroCarga, setErroCarga] = useState("");
  const [valores, setValores] = useState<Valores>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const [concluido, setConcluido] = useState(false);
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
    return () => {
      vivo = false;
    };
  }, [publicId]);

  const survey = dados && dados !== "vazio" ? dados : null;

  const respondidas = useMemo(() => {
    if (!survey) return 0;
    return survey.questions.filter((q) => !vazio(valores[q.id], q)).length;
  }, [survey, valores]);

  function definir(id: string, v: string | string[] | number | null) {
    setValores((atual) => ({ ...atual, [id]: v }));
    setErros((e) => {
      if (!e[id]) return e;
      const { [id]: _ignorado, ...resto } = e;
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
      if (vazio(valores[q.id], q)) novos[q.id] = `Escolha uma resposta para a pergunta ${q.number}.`;
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
      const sessionId = idDaSessao();
      const base = `/api/public/surveys/${encodeURIComponent(publicId)}`;
      const { proof } = await api.post<{ proof: string }>("/api/public/surveys/contest", { collectionPublicId: publicId, sessionId });
      await api.post(`${base}/responses`, { sessionId, proof, answers: valores });
      setConcluido(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : "Não foi possível enviar. Tente novamente.");
      topo.current?.scrollIntoView({ block: "start" });
    } finally {
      setEnviando(false);
    }
  }

  if (erroCarga)
    return (
      <main className="tela-aberta">
        <div className="cartao-q" style={{ maxWidth: 560 }}>
          <Cabo />
          <h1 className="titulo" style={{ marginTop: 20 }}>
            Questionário indisponível
          </h1>
          <p className="legenda" style={{ marginTop: 8 }}>
            {erroCarga}
          </p>
        </div>
      </main>
    );

  if (dados === null)
    return (
      <main className="tela-aberta">
        <p className="legenda" role="status" style={{ marginTop: 40 }}>
          Carregando questionário…
        </p>
      </main>
    );

  if (dados === "vazio")
    return (
      <main className="tela-aberta">
        <div className="cartao-q" style={{ maxWidth: 560 }}>
          <Cabo />
          <h1 className="titulo" style={{ marginTop: 20 }}>
            Este link não está disponível
          </h1>
          <p className="legenda" style={{ marginTop: 8 }}>
            O endereço pode estar incompleto ou a coleta foi removida. Peça novamente o link ao responsável pelo NUPE.
          </p>
        </div>
      </main>
    );

  if (concluido)
    return (
      <main className="tela-aberta">
        <div className="cartao-q" style={{ maxWidth: 560 }}>
          <Cabo />
          <h1 className="titulo" style={{ marginTop: 24 }}>
            Resposta registrada
          </h1>
          <p className="legenda" style={{ marginTop: 10, maxWidth: "58ch" }}>
            Obrigado(a) por participar. Sua resposta foi gravada de forma anônima e não pode ser identificada. Pode fechar esta
            página.
          </p>
        </div>
      </main>
    );

  if (survey!.status !== "aberta")
    return (
      <main className="tela-aberta">
        <div className="cartao-q" style={{ maxWidth: 560 }}>
          <Cabo />
          <h1 className="titulo" style={{ marginTop: 24 }}>
            {survey!.status === "encerrada" ? "Esta coleta foi encerrada" : "Esta coleta ainda não começou"}
          </h1>
          <p className="legenda" style={{ marginTop: 10, maxWidth: "58ch" }}>
            {survey!.status === "encerrada"
              ? "As respostas recebidas até o encerramento continuam valendo para o relatório do estágio."
              : "O link já existe, mas a coleta está pausada. Tente novamente mais tarde."}
          </p>
        </div>
      </main>
    );

  const totalObrigatorias = survey!.questions.filter((q) => !q.optional).length;
  const respondidasObrigatorias = survey!.questions.filter((q) => !q.optional && !vazio(valores[q.id], q)).length;
  const quantosErros = Object.keys(erros).length;

  return (
    <main className="tela-aberta q-fundo">
      <div className="cartao-q" ref={topo}>
        <Cabo />

        <header style={{ marginTop: 28 }}>
          <p className="micro" style={{ letterSpacing: "0.02em" }}>
            {survey!.title}
          </p>
          <h1 className="titulo" style={{ marginTop: 8 }}>
            O que o NUPE precisa melhorar?
          </h1>
          <p className="legenda texto-intro">{survey!.intro}</p>
          <ul className="fatos-resposta" aria-label="Sobre o questionário">
            <li>
              <b>{respondidasObrigatorias}</b> de {totalObrigatorias} perguntas obrigatórias respondidas
            </li>
            <li>Anônimo: não pede nome, e-mail nem telefone</li>
            <li>Leva de 3 a 5 minutos</li>
          </ul>
        </header>

        {falha || quantosErros ? (
          <div id="resumo-erros" className="aviso" role="alert" tabIndex={-1} style={{ marginTop: 20 }}>
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
          style={{ marginTop: 28 }}
        >
          <ol className="perguntas" aria-label="Perguntas">
            {survey!.questions.map((q) => (
              <li key={q.id}>
                <Pergunta
                  q={q}
                  valor={valores[q.id] ?? null}
                  erro={erros[q.id]}
                  aoMudar={(v) => definir(q.id, v)}
                  aoAlternar={(c) => alternarMulti(q, c)}
                />
              </li>
            ))}
          </ol>

          <div className="fecho">
            <p className="legenda" style={{ maxWidth: "56ch" }}>
              Ao enviar, a resposta é gravada sem qualquer dado que identifique você. Uma mesma pessoa responde uma vez por
              aparelho.
            </p>
            <button className="btn primario" type="submit" disabled={enviando} style={{ height: 44, padding: "0 22px" }}>
              {enviando ? "Enviando…" : "Enviar respostas"}
            </button>
            <p className="micro">{respondidas} de {survey!.questions.length} perguntas respondidas</p>
          </div>
        </form>
      </div>
    </main>
  );
}

function Cabo() {
  return (
    <div className="cabo">
      <span className="cabo-marca">
        <Marca size={26} />
        <span>NUPE · Núcleo de Pesquisa e Extensão · UNEB Campus XXI</span>
      </span>
    </div>
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
  erro,
  aoMudar,
  aoAlternar,
}: {
  q: Question;
  valor: string | string[] | number | null;
  erro?: string;
  aoMudar: (v: string | string[] | number | null) => void;
  aoAlternar: (code: string) => void;
}) {
  const nome = `p${q.number}`;
  return (
    <fieldset className={"pergunta" + (erro ? " com-erro" : "")} aria-describedby={erro ? `${nome}-erro` : q.optional ? `${nome}-opc` : undefined}>
      <legend>
        <span className="pergunta-num" aria-hidden="true" data-n={q.number}>
          {null}
        </span>
        <span className="pergunta-texto">{q.text}</span>
        {q.optional ? (
          <span className="opcional" id={`${nome}-opc`}>
            opcional
          </span>
        ) : null}
      </legend>

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

      {erro ? (
        <p id={`${nome}-erro`} className="erro-texto" role="alert">
          {erro}
        </p>
      ) : null}
    </fieldset>
  );
}
