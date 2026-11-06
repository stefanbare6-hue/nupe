/**
 * Catálogo de perguntas dos três questionários.
 * Alterar um `code` aqui invalida respostas antigas - para edição de texto,
 * use apenas `text`/`hint`/`options[].label`. O texto é fixo por versão para
 * preservar comparabilidade entre coletas.
 */

export type Audience = "docentes" | "estudantes" | "equipe";
export const AUDIENCES: Audience[] = ["docentes", "estudantes", "equipe"];

export type QuestionType = "single" | "multi" | "scale" | "open";

export interface Option {
  code: string;
  label: string;
}

export interface Question {
  id: string;
  code: string;
  number: number;
  type: QuestionType;
  text: string;
  hint?: string;
  options?: Option[];
  scale?: { min: 1; max: 5; minLabel: string; maxLabel: string };
  optional?: boolean;
}

export interface Survey {
  audience: Audience;
  title: string;
  shortTitle: string;
  intro: string;
  questions: Question[];
}

const ABERTURA =
  "Olá! Sou estagiário(a) do NUPE (Núcleo de Pesquisa e Extensão) do DCHT XXI, UNEB Campus XXI.";

const FECHAMENTO =
  "As respostas são anônimas, não pedem nome nem e-mail, e serão usadas apenas no relatório do estágio. " +
  "Obrigado(a) por participar!";

export const SURVEY_INTRO =
  `${ABERTURA} Este questionário leva de 3 a 5 minutos e busca entender como melhorar a divulgação e os processos ` +
  `de pesquisa e extensão. ${FECHAMENTO}`;

const INTRO_DOCENTES =
  `${ABERTURA} Este questionário leva de 3 a 5 minutos e faz parte do relatório do meu estágio. ` +
  `As perguntas são sobre o uso dos sistemas da UNEB no dia a dia da pesquisa e da extensão: ` +
  `SPGU, SISPROEX, SGE e SONIC. ${FECHAMENTO}`;

const INTRO_EQUIPE =
  `${ABERTURA} Este questionário leva de 3 a 5 minutos e faz parte do relatório do meu estágio. ` +
  `As perguntas são sobre a rotina do núcleo, o uso dos sistemas da UNEB (SPGU, SISPROEX, SGE e SONIC) ` +
  `e as atribuições do NUPE previstas no regimento. ${FECHAMENTO}`;

const SCALE = (minLabel: string, maxLabel: string) => ({ min: 1 as const, max: 5 as const, minLabel, maxLabel });

const q = (
  id: string,
  n: number,
  type: QuestionType,
  text: string,
  extra: Partial<Question> = {},
): Question => ({ id, code: id, number: n, type, text, ...extra });

export const DOCENTES: Survey = {
  audience: "docentes",
  title: "Questionário - Docentes",
  shortTitle: "Docentes",
  intro: INTRO_DOCENTES,
  questions: [
    q("d1", 1, "single", "Você coordena ou participa de projetos?", {
      options: [
        { code: "extensao", label: "Extensão" },
        { code: "pesquisa", label: "Pesquisa" },
        { code: "ambos", label: "Ambos" },
        { code: "nenhum", label: "Nenhum" },
      ],
    }),
    q("d2", 2, "multi", "Quais sistemas da UNEB fazem parte do seu trabalho?", {
      hint: "Marque todos os que usa, inclusive para consultar o andamento.",
      options: [
        { code: "spgu", label: "SPGU (cadastro de projetos)" },
        { code: "sisproex", label: "SISPROEX (extensão)" },
        { code: "sonic", label: "SONIC (relatórios de pesquisa)" },
        { code: "sge", label: "SGE (certificados)" },
        { code: "planilhas", label: "Planilhas ou anotações próprias" },
        { code: "nao_uso", label: "Não uso esses sistemas" },
      ],
    }),
    q("d3", 3, "scale", "De 1 a 5, quão fácil é usar o SISPROEX?", {
      scale: SCALE("1 – muito difícil", "5 – muito fácil"),
    }),
    q("d4", 4, "single", "Em qual etapa o processo trava mais?", {
      options: [
        { code: "cadastro_spgu", label: "Cadastro no SPGU" },
        { code: "importacao_sisproex", label: "Importação para o SISPROEX" },
        { code: "editais", label: "Participação em editais" },
        { code: "relatorio", label: "Relatório e prestação de contas (SISPROEX/SONIC)" },
        { code: "certificacao_sge", label: "Certificação no SGE" },
        { code: "nenhuma", label: "Nenhuma" },
      ],
    }),
    q("d5", 5, "single", "Você fica sabendo dos prazos dos relatórios com antecedência?", {
      options: [
        { code: "sempre", label: "Sempre" },
        { code: "as_vezes", label: "Às vezes" },
        { code: "nunca", label: "Nunca" },
        { code: "nao_se_aplica", label: "Não se aplica" },
      ],
    }),
    q("d6", 6, "scale", "De 1 a 5, o quanto o apoio do NUPE ajuda no seu trabalho?", {
      scale: SCALE("1 – nada", "5 – muito"),
    }),
    q("d7", 7, "multi", "O que você espera do NUPE?", {
      options: [
        { code: "avisos", label: "Avisos de prazos e editais" },
        { code: "orientacao", label: "Orientação sobre SPGU e SISPROEX" },
        { code: "certificacao", label: "Apoio na certificação de atividades" },
        { code: "intermediacao", label: "Intermediação com a Pró-Reitoria" },
        { code: "relatorios", label: "Ajuda com relatórios e prestação de contas" },
        { code: "nada", label: "Nada além do que já faz" },
      ],
    }),
    q("d8", 8, "open", "O que mais ajudaria você no processo de pesquisa e extensão?", { optional: true }),
  ],
};

export const ESTUDANTES: Survey = {
  audience: "estudantes",
  title: "Questionário - Estudantes",
  shortTitle: "Estudantes",
  intro: SURVEY_INTRO,
  questions: [
    q("e1", 1, "single", "Qual é o seu curso?", {
      options: [
        { code: "administracao", label: "Administração" },
        { code: "letras", label: "Letras" },
        { code: "eng_agroindustrial", label: "Engenharia Agroindustrial" },
      ],
    }),
    q("e2", 2, "multi", "Você já participou de projeto ou monitoria?", {
      options: [
        { code: "extensao", label: "Extensão" },
        { code: "pesquisa", label: "Pesquisa" },
        { code: "monitoria", label: "Monitoria" },
        { code: "nenhum", label: "Nenhum" },
      ],
    }),
    q("e3", 3, "single", "Você sabe o que o NUPE faz?", {
      options: [
        { code: "sim", label: "Sim" },
        { code: "em_parte", label: "Em parte" },
        { code: "nao", label: "Não" },
      ],
    }),
    q("e4", 4, "multi", "Como você fica sabendo de editais e oportunidades?", {
      options: [
        { code: "site", label: "Site" },
        { code: "grupos", label: "Grupos de mensagens" },
        { code: "professores", label: "Professores" },
        { code: "colegas", label: "Colegas" },
        { code: "murais", label: "Murais" },
        { code: "nao_fico_sabendo", label: "Não fico sabendo" },
      ],
    }),
    q("e5", 5, "multi", "O que mais dificulta sua participação?", {
      options: [
        { code: "falta_informacao", label: "Falta de informação" },
        { code: "prazos", label: "Prazos" },
        { code: "documentos", label: "Documentos" },
        { code: "falta_tempo", label: "Falta de tempo" },
        { code: "nao_sei_comecar", label: "Não sei como começar" },
      ],
    }),
    q("e6", 6, "scale", "De 1 a 5, as informações sobre projetos e editais são claras?", {
      scale: SCALE("1 – nada claras", "5 – muito claras"),
    }),
    q("e7", 7, "single", "Você participaria de um canal no WhatsApp com editais e projetos?", {
      options: [
        { code: "sim", label: "Sim" },
        { code: "talvez", label: "Talvez" },
        { code: "nao", label: "Não" },
      ],
    }),
    q("e8", 8, "open", "Que sugestão você daria para divulgar melhor as oportunidades?", { optional: true }),
  ],
};

export const EQUIPE: Survey = {
  audience: "equipe",
  title: "Questionário - Equipe do NUPE",
  shortTitle: "Equipe do NUPE",
  intro: INTRO_EQUIPE,
  questions: [
    q("q1", 1, "multi", "Quais frentes mais consomem o tempo da equipe?", {
      options: [
        { code: "spgu", label: "Acompanhamento de projetos no SPGU" },
        { code: "sisproex", label: "Importação e acompanhamento no SISPROEX" },
        { code: "sge", label: "Certificação de atividades no SGE" },
        { code: "relatorios", label: "Relatórios e prestação de contas" },
        { code: "monitoria", label: "Acompanhamento da monitoria" },
        { code: "jornada", label: "Jornada de Pesquisa e Extensão" },
        { code: "eventos", label: "Novembro Negro e outros eventos" },
        { code: "rotina", label: "Atendimento e demandas do dia a dia" },
      ],
    }),
    q("q2", 2, "single", "Onde o trabalho mais trava hoje?", {
      options: [
        { code: "cadastro_spgu", label: "Cadastro e atualização no SPGU" },
        { code: "importacao_sisproex", label: "Importação do projeto para o SISPROEX" },
        { code: "editais", label: "Acompanhamento de editais e recursos" },
        { code: "certificados_sge", label: "Certificação de atividades no SGE" },
        { code: "relatorios", label: "Relatórios e prestação de contas" },
        { code: "monitoria", label: "Acompanhamento da monitoria" },
        { code: "nenhum", label: "Não vejo travamento" },
      ],
    }),
    q("q3", 3, "scale", "De 1 a 5, quão fácil é usar o SISPROEX no dia a dia?", {
      scale: SCALE("1 – muito difícil", "5 – muito fácil"),
    }),
    q("q4", 4, "single", "Com que frequência os relatórios e as prestações de contas chegam atrasados?", {
      options: [
        { code: "raramente", label: "Raramente" },
        { code: "as_vezes", label: "Às vezes" },
        { code: "quase_sempre", label: "Quase sempre" },
      ],
    }),
    q("q5", 5, "single", "Qual é a principal causa dos atrasos?", {
      options: [
        { code: "falta_aviso", label: "Aviso tardio do prazo" },
        { code: "dificuldade_sistema", label: "Dificuldade para usar o sistema" },
        { code: "falta_documentos", label: "Documentos ou comprovantes incompletos" },
        { code: "falta_tempo", label: "Falta de tempo do responsável" },
        { code: "nao_sei", label: "Não sei dizer" },
      ],
    }),
    q("q6", 6, "multi", "Quais sistemas fazem parte da rotina do NUPE?", {
      options: [
        { code: "spgu", label: "SPGU" },
        { code: "sisproex", label: "SISPROEX" },
        { code: "sge", label: "SGE" },
        { code: "sonic", label: "SONIC" },
        { code: "monitoria", label: "Sistema de monitoria" },
        { code: "planilhas", label: "Planilhas e documentos próprios" },
        { code: "nenhum", label: "Nenhum" },
      ],
    }),
    q("q7", 7, "scale", "De 1 a 5, quanto dos pedidos que chegam ao NUPE está dentro das atribuições do núcleo?", {
      scale: SCALE("1 – nada", "5 – tudo"),
    }),
    q("q8", 8, "open", "O que mais atrapalha o trabalho do NUPE hoje?", { optional: true }),
  ],
};

export const SURVEYS: Record<Audience, Survey> = {
  docentes: DOCENTES,
  estudantes: ESTUDANTES,
  equipe: EQUIPE,
};

export function getSurvey(audience: Audience): Survey {
  return SURVEYS[audience];
}

export function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && (AUDIENCES as string[]).includes(v);
}

/**
 * Nome do público no meio de uma frase: "a coleta dos estudantes", "da equipe
 * do NUPE". Escrever `label.toLowerCase()` estraga a sigla.
 */
export function publicoNaFrase(audience: Audience): string {
  if (audience === "equipe") return "da equipe do NUPE";
  if (audience === "docentes") return "dos docentes";
  return "dos estudantes";
}

export function getQuestion(audience: Audience, id: string): Question | undefined {
  return SURVEYS[audience].questions.find((x) => x.id === id);
}
