/**
 * Estruturas das fichas de campo (módulo 3) e da guia de matrizes.
 * Os identificadores de coluna são estáveis e usados pelo gerador de relatório.
 */

export interface ColumnDef {
  key: string;
  label: string;
  /** Tipo do editor. `long` = caixa multilinha. */
  kind?: "text" | "long" | "date" | "number";
}

export interface InstitutionField {
  key: string;
  label: string;
  hint?: string;
  kind?: "text" | "long";
}

export const INSTITUTION_FIELDS: InstitutionField[] = [
  { key: "missao", label: "Missão" },
  { key: "visao", label: "Visão" },
  { key: "valores", label: "Valores" },
  { key: "coordenacao", label: "Quem coordena" },
  { key: "estrutura", label: "Estrutura organizacional", kind: "long" } as InstitutionField,
  { key: "lideranca", label: "Estilo de liderança", hint: "Autocrático, participativo ou liberal" },
];

export const NUMBERS_COLUMNS: ColumnDef[] = [
  { key: "indicator", label: "Indicador" },
  { key: "value", label: "Valor" },
  { key: "source", label: "Fonte e ano" },
];

export const NUMBERS_INITIAL = [
  "Projetos de extensão ativos",
  "Projetos de pesquisa ativos",
  "Bolsistas",
  "Editais por ano",
  "Públicos atendidos",
];

export const FLOW_COLUMNS: ColumnDef[] = [
  { key: "stage", label: "Etapa" },
  { key: "who", label: "Quem faz" },
  { key: "docSystem", label: "Documento ou sistema" },
  { key: "deadline", label: "Prazo" },
  { key: "blocker", label: "Onde trava" },
];

export interface FlowTemplateStep {
  stage: string;
  docSystem?: string;
  deadline?: string;
}

export const FLOW_TEMPLATES: Array<{ id: string; name: string; process: string; steps: FlowTemplateStep[] }> = [
  {
    id: "bolsa-monitoria",
    name: "Pagamento da bolsa de monitoria de extensão",
    process: "Pagamento da bolsa de monitoria de extensão",
    steps: [
      { stage: "1. Edital e seleção" },
      { stage: "2. Comunicação do resultado" },
      { stage: "3. Registro no SISPROEX", docSystem: "SISPROEX" },
      { stage: "4. Pagamento mensal da bolsa", deadline: "Mensal" },
      { stage: "5. Relatório", docSystem: "SISPROEX" },
    ],
  },
];

export interface SystemField {
  key: string;
  label: string;
}

export const SYSTEM_FIELDS: SystemField[] = [
  { key: "nomeFinalidade", label: "Nome e finalidade" },
  { key: "quemUsa", label: "Quem usa" },
  { key: "oQueEntra", label: "O que entra (dados e documentos)" },
  { key: "oQueSai", label: "O que sai (relatórios e registros)" },
  { key: "errosComuns", label: "Dúvidas e erros mais comuns" },
  { key: "suporte", label: "Quem dá suporte" },
];

export const SYSTEM_INITIAL: Array<{ id: string; name: string }> = [
  { id: "sisproex", name: "SISPROEX" },
  { id: "iniciacao-cientifica", name: "Sistema de iniciação científica [confirmar o nome]" },
];

export interface ProcedureRowDef {
  id: string;
  procedure: string;
  base: string;
  /** Trecho normativo fixo (não editável). */
  fixedBase?: boolean;
  deadline?: string;
  /** Atenção registrada na planilha de origem. */
  note?: string;
}

export const PROCEDURES_INITIAL: ProcedureRowDef[] = [
  {
    id: "selecao",
    procedure: "Seleção de projetos e bolsistas",
    base: "Edital",
  },
  {
    id: "registro",
    procedure: "Registro e acompanhamento de projetos",
    base: "Regimento do NUPE",
    note: "confirmar",
  },
  {
    id: "pagamento",
    procedure: "Pagamento de bolsas",
    base: "",
    deadline: "Mensal",
  },
  {
    id: "relatorios",
    procedure: "Relatórios de projetos",
    base: "",
  },
  {
    id: "estagio",
    procedure: "Estágio supervisionado",
    base: "Lei do Estágio (Lei 11.788/2008)",
    fixedBase: true,
  },
  {
    id: "trabalhista",
    procedure: "Direito trabalhista e previdenciário",
    base: "Combinar com o professor o recorte esperado",
    fixedBase: true,
    note: "confirmar",
  },
];

export const PROCEDURE_COLUMNS: ColumnDef[] = [
  { key: "procedure", label: "Procedimento" },
  { key: "base", label: "Base normativa" },
  { key: "responsible", label: "Responsável" },
  { key: "deadline", label: "Prazo" },
];

export const FIVE_W2H_KEYS: Array<{ key: string; label: string }> = [
  { key: "oQue", label: "O quê" },
  { key: "porQue", label: "Por quê" },
  { key: "quem", label: "Quem" },
  { key: "onde", label: "Onde" },
  { key: "quando", label: "Quando" },
  { key: "como", label: "Como" },
  { key: "quanto", label: "Quanto" },
];

export const FIVE_W2H_INITIAL: Record<string, string> = {
  oQue: "Canal no WhatsApp com editais e projetos de extensão",
  porQue: "Docentes e estudantes têm dificuldade de achar informações no SISPROEX",
  quem: "Estagiário, com apoio da coordenação do NUPE",
  onde: "WhatsApp e murais do DCHT XXI [confirmar]",
  quando: "[definir prazo e frequência]",
  como: "Resumir as páginas do SISPROEX em avisos curtos",
  quanto: "Sem custo adicional [confirmar]",
};

export const PDCA_KEYS: Array<{ key: string; label: string }> = [
  { key: "planejar", label: "Planejar" },
  { key: "fazer", label: "Fazer" },
  { key: "checar", label: "Checar" },
  { key: "ajustar", label: "Ajustar" },
];

export const DIARY_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Data", kind: "date" },
  { key: "observation", label: "O que observei", kind: "long" },
  { key: "source", label: "Fonte (documento, sistema ou conversa)" },
  { key: "question", label: "Dúvida que ficou", kind: "long" },
];

export const GLOSSARY_COLUMNS: ColumnDef[] = [
  { key: "acronym", label: "Sigla" },
  { key: "meaning", label: "Significado" },
  { key: "source", label: "Fonte" },
];

export const GLOSSARY_INITIAL = [
  { acronym: "NUPE", meaning: "Núcleo de Pesquisa e Extensão", source: "Slides do estágio" },
  { acronym: "DCHT XXI", meaning: "[confirmar o nome por extenso]", source: "" },
  { acronym: "SISPROEX", meaning: "[confirmar o nome por extenso]", source: "" },
  {
    acronym: "Pró-reitoria de Gestão e Desenvolvimento de Pessoas",
    meaning: "Setor com o manual de gestão de pessoas da UNEB",
    source: "",
  },
];

export const INTERVIEW_GUIDE = [
  {
    phase: "Levantamento",
    tool: "Porter",
    question: "Quem são clientes, fornecedores e concorrentes?",
  },
  {
    phase: "Diagnóstico",
    tool: "SWOT",
    question:
      "O que é força ou fraqueza (interno) e oportunidade ou ameaça (externo)? Oportunidade só vale se o setor tem força para aproveitá-la.",
  },
  {
    phase: "Proposta",
    tool: "5W2H",
    question: "O quê, por quê, quem, onde, quando, como e quanto?",
  },
  {
    phase: "Acompanhamento",
    tool: "PDCA",
    question: "O que planejar, fazer, checar e ajustar?",
  },
];

export interface MatrixItem {
  id: string;
  text: string;
  /** Pontuação GUT (gravidade × urgência × tendência), 1 a 5 cada. */
  gravity?: number;
  urgency?: number;
  tendency?: number;
  /** Vínculo com uma força interna (SWOT - oportunidade). */
  linkedStrengthId?: string;
  /** Citação de evidência (pergunta, ficha ou diário). */
  evidence?: string;
}

export interface Matrices {
  porter: {
    clientes: MatrixItem[];
    fornecedores: MatrixItem[];
    concorrentes: MatrixItem[];
    novosEntrantes: MatrixItem[];
    substitutos: MatrixItem[];
  };
  swot: {
    forcas: MatrixItem[];
    fraquezas: MatrixItem[];
    oportunidades: MatrixItem[];
    ameacas: MatrixItem[];
  };
  gut: MatrixItem[];
  /** Frases prontas do relatório que o estagiário pode ajustar. */
  notes: Record<string, string>;
}

export const PORTER_LABELS: Array<{ key: keyof Matrices["porter"]; label: string; hint: string }> = [
  { key: "clientes", label: "Clientes", hint: "Quem depende do NUPE: docentes, estudantes, comunidade, outros setores" },
  { key: "fornecedores", label: "Fornecedores", hint: "Pró-reitorias, direção do DCHT, sistemas, financiadores" },
  { key: "concorrentes", label: "Concorrentes", hint: "Outros setores que disputam o mesmo público ou recurso" },
  { key: "novosEntrantes", label: "Novos entrantes", hint: "Quem começara a oferecer serviços semelhantes" },
  { key: "substitutos", label: "Substitutos", hint: "Outras formas de acessar editais e apoio" },
];

export const SWOT_LABELS: Array<{ key: keyof Matrices["swot"]; label: string; nature: "interno" | "externo" }> = [
  { key: "forcas", label: "Forças", nature: "interno" },
  { key: "fraquezas", label: "Fraquezas", nature: "interno" },
  { key: "oportunidades", label: "Oportunidades", nature: "externo" },
  { key: "ameacas", label: "Ameaças", nature: "externo" },
];

/** Rótulos usados no relatório/limitações quando a célula está vazia. */
export const PLACEHOLDER = "[preencher]";

export function isPlaceholder(text: string | null | undefined): boolean {
  if (text == null) return true;
  const t = text.trim();
  return t === "" || /^\[\s*preencher\s*\]$/i.test(t) || /\[preencher\]/i.test(t);
}
