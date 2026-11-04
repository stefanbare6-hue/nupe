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

export const SURVEY_INTRO =
  "Olá! Sou estagiário(a) do NUPE (Núcleo de Pesquisa e Extensão) do DCHT XXI, UNEB Campus XXI. " +
  "Este questionário leva de 3 a 5 minutos e busca entender como melhorar a divulgação e os processos " +
  "de pesquisa e extensão. As respostas são anônimas e serão usadas apenas no relatório do estágio. " +
  "Obrigado(a) por participar!";

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
  intro: SURVEY_INTRO,
  questions: [
    q("d1", 1, "single", "Você coordena ou participa de projetos?", {
      options: [
        { code: "extensao", label: "Extensão" },
        { code: "pesquisa", label: "Pesquisa" },
        { code: "ambos", label: "Ambos" },
        { code: "nenhum", label: "Nenhum" },
      ],
    }),
    q("d2", 2, "multi", "Onde você costuma encontrar editais de extensão e pesquisa?", {
      options: [
        { code: "site", label: "Site da UNEB" },
        { code: "grupos", label: "Grupos de mensagens" },
        { code: "colegas", label: "Colegas" },
        { code: "nupe", label: "NUPE" },
        { code: "nao_encontro", label: "Não encontro" },
      ],
    }),
    q("d3", 3, "scale", "De 1 a 5, quão fácil é usar o SISPROEX?", {
      scale: SCALE("1 – muito difícil", "5 – muito fácil"),
    }),
    q("d4", 4, "single", "Em qual etapa você sente mais dificuldade?", {
      options: [
        { code: "registro", label: "Registro do projeto" },
        { code: "relatorio", label: "Relatório" },
        { code: "prestacao", label: "Prestação de contas" },
        { code: "nenhuma", label: "Nenhuma" },
      ],
    }),
    q("d5", 5, "single", "Você fica sabendo dos prazos dos relatórios com antecedência?", {
      options: [
        { code: "sempre", label: "Sempre" },
        { code: "as_vezes", label: "Às vezes" },
        { code: "nunca", label: "Nunca" },
      ],
    }),
    q("d6", 6, "scale", "De 1 a 5, o quanto o apoio do NUPE ajuda no seu trabalho?", {
      scale: SCALE("1 – nada", "5 – muito"),
    }),
    q("d7", 7, "single", "Você participaria de um canal no WhatsApp com editais e projetos de extensão?", {
      options: [
        { code: "sim", label: "Sim" },
        { code: "talvez", label: "Talvez" },
        { code: "nao", label: "Não" },
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
  intro: SURVEY_INTRO,
  questions: [
    q("q1", 1, "multi", "Quais atividades mais consomem o tempo do NUPE?", {
      options: [
        { code: "divulgacao", label: "Divulgação de editais" },
        { code: "apoio_estudantes", label: "Apoio a estudantes" },
        { code: "documentos", label: "Documentos" },
        { code: "relatorios", label: "Relatórios" },
        { code: "atendimento", label: "Atendimento" },
        { code: "suporte_ti", label: "Suporte de TI" },
        { code: "outras", label: "Outras" },
      ],
    }),
    q("q2", 2, "single", "Em qual etapa do fluxo há mais retrabalho?", {
      options: [
        { code: "selecao", label: "Seleção" },
        { code: "registro", label: "Registro" },
        { code: "pagamento", label: "Pagamento de bolsa" },
        { code: "relatorio", label: "Relatório" },
        { code: "outra", label: "Outra" },
      ],
      optional: true,
    }),
    q("q3", 3, "scale", "De 1 a 5, quão fácil é usar o SISPROEX no dia a dia?", {
      scale: SCALE("1 – muito difícil", "5 – muito fácil"),
    }),
    q("q4", 4, "single", "Com que frequência os relatórios chegam atrasados?", {
      options: [
        { code: "raramente", label: "Raramente" },
        { code: "as_vezes", label: "Às vezes" },
        { code: "quase_sempre", label: "Quase sempre" },
      ],
    }),
    q("q5", 5, "single", "Qual é a principal causa dos atrasos?", {
      options: [
        { code: "falta_aviso", label: "Falta de aviso" },
        { code: "esquecimento", label: "Esquecimento" },
        { code: "dificuldade_sistema", label: "Dificuldade no sistema" },
        { code: "falta_documentos", label: "Falta de documentos" },
        { code: "outra", label: "Outra" },
      ],
    }),
    q("q6", 6, "multi", "Quais canais o NUPE usa hoje para divulgar?", {
      options: [
        { code: "site", label: "Site" },
        { code: "grupos", label: "Grupos de mensagens" },
        { code: "murais", label: "Murais" },
        { code: "email", label: "E-mail" },
        { code: "reunioes", label: "Reuniões" },
        { code: "outros", label: "Outros" },
      ],
    }),
    q("q7", 7, "scale", "De 1 a 5, a divulgação alcança estudantes e comunidade?", {
      scale: SCALE("1 – nada", "5 – totalmente"),
    }),
    q("q8", 8, "open", "Que mudança melhoraria o trabalho do setor?", { optional: true }),
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
