/**
 * Constrói o modelo do relatório de diagnóstico a partir das métricas e fichas.
 * Regras: cada afirmação citada carrega evidência; nada é inventado; o que faltar
 * vira [preencher] e alimenta a lista de limitações.
 */
import { INSTITUTION_FIELDS, NUMBERS_COLUMNS, PLACEHOLDER, isPlaceholder, type Matrices } from "./forms";
import type { AudienceSummary, QuestionResult } from "./stats";
import { MIN_SAMPLE_FOR_PERCENT } from "./stats";
import { SURVEYS, publicoNaFrase } from "./surveys";

/** Quantos campos faltantes a seção 9 lista antes de resumir o restante. */
const LIMITE_LISTA_FALTANTES = 60;

export interface InstitutionData {
  fields: Record<string, string>;
  numbers: Array<{ indicator: string; value: string; source: string }>;
}

export interface FlowView {
  name: string;
  process: string;
  steps: Array<{ stage: string; who: string; docSystem: string; deadline: string; blocker: string }>;
}

export interface ReportInput {
  generatedAt: string;
  period: string;
  summaries: Record<string, AudienceSummary>;
  institution: InstitutionData;
  flows: FlowView[];
  systems: Array<{ name: string; fields: Record<string, string> }>;
  matrices: Matrices;
  improvement: { idea: string; fiveW2H: Record<string, string>; pdca: Record<string, string> };
  procedures: Array<{ procedure: string; base: string; responsible: string; deadline: string }>;
  diaryCount: number;
  themeGroups: Array<{ label: string; count: number; examples: string[] }>;
  audienceLabels: Record<string, string>;
}

export interface Evidence {
  label: string;
  ref: string;
}

export interface ReportSection {
  id: string;
  title: string;
  paras: Array<{ text: string; evidence?: Evidence[]; kind?: "p" | "note" | "warn" }>;
  table?: { caption?: string; head: string[]; rows: string[][]; status?: string[]; priority?: string[] };
  lists?: Array<{ title: string; items: string[] }>;
}

export interface GutRow {
  id: string;
  title: string;
  origin: string;
  score: number;
  priority: "Alta" | "Média" | "Baixa";
  evidence: Evidence[];
}

export interface ReportModel {
  title: string;
  subtitle: string;
  generatedAt: string;
  sections: ReportSection[];
  missing: MissingItem[];
  gut: GutRow[];
  nextSteps: Array<{ action: string; owner: string; deadline: string; basis: string }>;
  status: "completo" | "incompleto";
}

export interface MissingItem {
  where: string;
  field: string;
}

const AUD = ["docentes", "estudantes", "equipe"] as const;

function fmtPct(v: number | null): string {
  return v === null ? " - " : `${String(v).replace(".", ",")}%`;
}

function qRef(aud: string, q: QuestionResult): Evidence {
  return { label: `${SURVEYS[aud as keyof typeof SURVEYS]?.shortTitle ?? aud} · Q${q.number}`, ref: q.questionId };
}

function topOptions(q: QuestionResult, n = 2): Array<{ label: string; count: number; percent: number | null }> {
  return [...q.options].sort((a, b) => b.count - a.count).slice(0, n);
}

function scaleMean(summary: AudienceSummary | undefined, qid: string): number | null {
  return summary?.questions.find((q) => q.questionId === qid)?.scale?.mean ?? null;
}

export function buildMissing(input: ReportInput): MissingItem[] {
  const missing: MissingItem[] = [];
  for (const f of INSTITUTION_FIELDS) {
    if (isPlaceholder(input.institution.fields[f.key])) {
      missing.push({ where: "Ficha 1 - Levantamento institucional", field: f.label });
    }
  }
  input.institution.numbers.forEach((row, i) => {
    if (isPlaceholder(row.value)) missing.push({ where: "Ficha 2 - Números do setor", field: `${row.indicator || `Linha ${i + 1}`} (valor)` });
    if (isPlaceholder(row.source)) missing.push({ where: "Ficha 2 - Números do setor", field: `${row.indicator || `Linha ${i + 1}`} (fonte e ano)` });
  });
  for (const flow of input.flows) {
    flow.steps.forEach((s) => {
      if (isPlaceholder(s.blocker)) missing.push({ where: `Ficha 3 - ${flow.name}`, field: `${s.stage} · onde trava` });
    });
  }
  for (const s of input.systems) {
    for (const [k, v] of Object.entries(s.fields)) {
      if (isPlaceholder(v)) missing.push({ where: `Ficha 4 - ${s.name}`, field: k });
    }
  }
  input.procedures.forEach((p) => {
    if (isPlaceholder(p.responsible)) missing.push({ where: "Ficha 5 - Procedimentos", field: `${p.procedure} · responsável` });
    if (isPlaceholder(p.base)) missing.push({ where: "Ficha 5 - Procedimentos", field: `${p.procedure} · base normativa` });
    if (isPlaceholder(p.deadline)) missing.push({ where: "Ficha 5 - Procedimentos", field: `${p.procedure} · prazo` });
  });
  for (const [k, v] of Object.entries(input.improvement.fiveW2H)) {
    if (isPlaceholder(v)) missing.push({ where: "Ficha 6 - Plano de melhoria (5W2H)", field: k });
  }
  for (const [k, v] of Object.entries(input.improvement.pdca)) {
    if (isPlaceholder(v)) missing.push({ where: "Ficha 6 - Plano de melhoria (PDCA)", field: k });
  }
  for (const key of ["clientes", "fornecedores", "concorrentes", "novosEntrantes", "substitutos"] as const) {
    if (input.matrices.porter[key].length === 0) missing.push({ where: "Matriz de Porter", field: labelPorter(key) });
  }
  for (const key of ["forcas", "fraquezas", "oportunidades", "ameacas"] as const) {
    if (input.matrices.swot[key].length === 0) missing.push({ where: "SWOT", field: key });
  }
  for (const aud of AUD) {
    const s = input.summaries[aud];
    if (!s || s.total === 0) missing.push({ where: "Amostra", field: `Nenhuma resposta do público ${input.audienceLabels[aud] ?? aud}` });
  }
  return missing;
}

function labelPorter(key: string): string {
  return (
    { clientes: "Clientes", fornecedores: "Fornecedores", concorrentes: "Concorrentes", novosEntrantes: "Novos entrantes", substitutos: "Substitutos" }[
      key
    ] ?? key
  );
}

export function computeGut(input: ReportInput): GutRow[] {
  const rows: GutRow[] = [];
  for (const m of input.matrices.gut) {
    const g = clamp(m.gravity), u = clamp(m.urgency), t = clamp(m.tendency);
    rows.push({
      id: m.id,
      title: m.text,
      origin: m.evidence ?? "Matriz GUT (ficha do estagiário)",
      score: g * u * t,
      priority: g * u * t >= 60 ? "Alta" : g * u * t >= 30 ? "Média" : "Baixa",
      evidence: m.evidence ? [{ label: m.evidence, ref: "gut" }] : [{ label: "Matriz GUT", ref: "gut" }],
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

function clamp(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Valida a SWOT: fronteiras interno/externo e a regra "oportunidade só vale
 * se existir força interna que a aproveite" - a oportunidade expressa uma
 * fraqueza do próprio setor (ex.: "falta de comunicação") é rejeitada.
 */
export function validateSwot(m: Matrices): Array<{ level: "erro" | "aviso"; text: string }> {
  const issues: Array<{ level: "erro" | "aviso"; text: string }> = [];
  const strengthTexts = m.swot.forcas.map((x) => normalizeReport(x.text));
  const weaknessTexts = m.swot.fraquezas.map((x) => normalizeReport(x.text));
  for (const o of m.swot.oportunidades) {
    if (weaknessTexts.length && weaknessTexts.some((w) => overlapRatio(w, normalizeReport(o.text)) >= 0.6)) {
      issues.push({ level: "erro", text: `“${o.text}” repete uma fraqueza como oportunidade.` });
    }
    if (!o.linkedStrengthId || !m.swot.forcas.some((f) => f.id === o.linkedStrengthId)) {
      issues.push({ level: "aviso", text: `“${o.text}” não indica a força interna que a aproveita.` });
    }
  }
  for (const a of m.swot.ameacas) {
    if (strengthTexts.some((s) => overlapRatio(s, normalizeReport(a.text)) >= 0.6)) {
      issues.push({ level: "aviso", text: `“${a.text}” parece interna; ameaças são externas.` });
    }
  }
  return issues;
}

function normalizeReport(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").trim();
}

function overlapRatio(a: string, b: string): number {
  const wa = new Set(a.split(/\s+/).filter(Boolean));
  const wb = new Set(b.split(/\s+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit += 1;
  return hit / Math.min(wa.size, wb.size);
}

export function buildNextSteps(input: ReportInput, gut: GutRow[]): ReportModel["nextSteps"] {
  const steps: ReportModel["nextSteps"] = [];
  const equipe = input.summaries.equipe;
  const estudantes = input.summaries.estudantes;
  const docentes = input.summaries.docentes;
  const idea = input.improvement.idea || PLACEHOLDER;

  const w2hWhen = input.improvement.fiveW2H["quando"] ?? "";
  const w2hWhenMissing = isPlaceholder(w2hWhen);
  const owner = input.improvement.fiveW2H["quem"] || PLACEHOLDER;

  // 1) Plano 5W2H (canal de avisos)
  steps.push({
    action: `Implantar: ${idea}`,
    owner,
    deadline: w2hWhenMissing ? PLACEHOLDER : w2hWhen,
    basis: "Ficha 6 - Ficha de melhoria (5W2H)",
  });

  // 2) Do questionário: prazos de relatório
  const dPrazosOk = topOptions(docentes?.questions.find((q) => q.questionId === "d5") ?? emptyQ(), 1)[0];
  const qAtrasos = equipe?.questions.find((q) => q.questionId === "q4");
  const qAtrasosTop = qAtrasos ? topOptions(qAtrasos, 1)[0] : undefined;
  if ((dPrazosOk && dPrazosOk.count > 0) || (qAtrasosTop && qAtrasosTop.count > 0)) {
    steps.push({
      action: "Calendário único de prazos de relatório (avisos 30, 15 e 3 dias antes)",
      owner: "Coordenação do NUPE",
      deadline: PLACEHOLDER,
      basis: "Questionário Docentes Q5; Questionário Equipe Q4",
    });
  }

  // 3) Perguntas de escala com média baixa (≤3)
  const d3 = scaleMean(docentes, "d3");
  const q3 = scaleMean(equipe, "q3");
  if ((d3 !== null && d3 <= 3) || (q3 !== null && q3 <= 3)) {
    steps.push({
      action: "Oficina de 1h sobre registro e relatório no SISPROEX",
      owner: "Estagiário, com apoio do setor de TI",
      deadline: PLACEHOLDER,
      basis: `Questionário Docentes Q3 (média ${d3 !== null ? String(d3).replace(".", ",") : " - "}); Equipe Q3 (média ${q3 !== null ? String(q3).replace(".", ",") : " - "})`,
    });
  }

  // 4) Divulgação entre estudantes
  const e3 = estudantes?.questions.find((q) => q.questionId === "e3");
  const e3Top = e3 ? topOptions(e3, 1)[0] : undefined;
  if (e3 && e3.answered > 0) {
    steps.push({
      action: "Apresentação de 10 min do NUPE nas primeiras aulas dos três cursos",
      owner: "Estagiário + coordenação",
      deadline: PLACEHOLDER,
      basis: `Questionário Estudantes Q3 (${e3Top?.label ?? " - "}: ${e3Top?.count ?? 0} de ${e3.answered})`,
    });
  }

  // 5) GUT prioridade alta → primeiro gargalo
  const topGut = gut[0];
  if (topGut) {
    steps.push({
      action: `Atacar gargalo: ${topGut.title}`,
      owner: PLACEHOLDER,
      deadline: PLACEHOLDER,
      basis: `Matriz GUT (${topGut.score} pts, ${topGut.priority})`,
    });
  }

  // Completa até 5 com ações do plano de melhoria (PDCA)
  const pdcaChecar = input.improvement.pdca["checar"] ?? "";
  if (steps.length < 5 && !isPlaceholder(pdcaChecar)) {
    steps.push({
      action: "Primeira checagem do plano (medição, antes/depois, indicadores)",
      owner,
      deadline: PLACEHOLDER,
      basis: "Ficha 6 - PDCA · Checar",
    });
  }
  while (steps.length < 5) {
    steps.push({ action: PLACEHOLDER, owner: PLACEHOLDER, deadline: PLACEHOLDER, basis: "Definir com a coordenação" });
  }
  return steps.slice(0, 5);
}

function emptyQ(): QuestionResult {
  return { questionId: "", number: 0, text: "", type: "single", answered: 0, total: 0, showPercent: false, options: [] };
}

export function buildReport(input: ReportInput): ReportModel {
  const missing = buildMissing(input);
  const gut = computeGut(input);
  const nextSteps = buildNextSteps(input, gut);
  const sections: ReportSection[] = [];

  const audLabel = input.audienceLabels;
  const totals = AUD.map((a) => ({ a, label: audLabel[a] ?? a, total: input.summaries[a]?.total ?? 0 }));
  const totalAll = totals.reduce((s, t) => s + t.total, 0);

  // 1. Resumo e amostra
  sections.push({
    id: "resumo",
    title: "1. Resumo e amostra",
    paras: [
      {
        text:
          `Este relatório reúne os dados coletados no estágio no NUPE (Núcleo de Pesquisa e Extensão), ` +
          `UNEB Campus XXI - DCHT XXI, entre ${input.period || PLACEHOLDER}. Foram recebidas ${totalAll} ` +
          `${totalAll === 1 ? "resposta" : "respostas"} ao todo (${totals
            .map((t) => `${t.total} ${publicoNaFrase(t.a)}`)
            .join(", ")}).`,
        evidence: [{ label: "Módulo 2 - Painel de resultados", ref: "amostra" }],
      },
      {
        text:
          `Os percentuais só são calculados quando o público reúne pelo menos ${MIN_SAMPLE_FOR_PERCENT} respostas. ` +
          `Abaixo desse limite, o painel apresenta apenas contagens e o aviso “amostra pequena”. ` +
          // Os parênteses são necessários: sem eles o `+` junta o texto e a
          // condição, e o ternário recebe uma string sempre verdadeira.
          (gut.some((g) => g.title.trim())
            ? `Os gargalos foram ordenados por pontuação GUT (gravidade × urgência × tendência): ${gut
                .filter((g) => g.title.trim())
                .slice(0, 3)
                .map((g) => `${g.title} (${g.score})`)
                .join("; ")}.`
            : "A matriz GUT ainda não foi preenchida, portanto não há ordenação de gargalos."),
        evidence: [{ label: "Matriz GUT", ref: "gut" }],
      },
    ],
    table: {
      caption: "Respostas por público",
      head: ["Público", "Respostas", "Percentuais liberados"],
      rows: totals.map((t) => [t.label, String(t.total), t.total >= MIN_SAMPLE_FOR_PERCENT ? "Sim" : "Amostra pequena"]),
    },
    lists: [
      {
        title: "Resultados por pergunta",
        items: AUD.flatMap((a) => {
          const s = input.summaries[a];
          if (!s) return [];
          return s.questions
            .filter((q) => q.type !== "open")
            .map((q) => summarizeQuestion(s, q, audLabel[a] ?? a));
        }),
      },
    ],
  });

  // 2. Levantamento institucional e números
  sections.push({
    id: "levantamento",
    title: "2. Levantamento institucional e números do setor",
    paras: [
      {
        text: "Os dados abaixo foram registrados pelo estagiário na Ficha 1 (levantamento institucional) e na Ficha 2 (números do setor). Células ainda não preenchidas aparecem como [preencher].",
        evidence: [{ label: "Ficha 1", ref: "ficha1" }, { label: "Ficha 2", ref: "ficha2" }],
      },
    ],
    table: {
      caption: "Levantamento institucional",
      head: ["Campo", "Anotação"],
      rows: INSTITUTION_FIELDS.map((f) => [f.label, input.institution.fields[f.key] || PLACEHOLDER]),
      status: INSTITUTION_FIELDS.map((f) => (isPlaceholder(input.institution.fields[f.key]) ? "pendente" : "ok")),
    },
    lists: [
      {
        title: "Números do setor",
        items: input.institution.numbers.map(
          (r) => `${r.indicator}: ${r.value || PLACEHOLDER} (fonte: ${r.source || PLACEHOLDER})`,
        ),
      },
    ],
  });

  // 3. Fluxo atual e gargalos
  const flowRows = input.flows.flatMap((f) =>
    f.steps.map((s) => [f.name, s.stage, s.who || PLACEHOLDER, s.docSystem || PLACEHOLDER, s.deadline || PLACEHOLDER, s.blocker || PLACEHOLDER]),
  );
  const systemsRows = input.systems.flatMap((s) =>
    Object.entries(s.fields).map(([k, v]) => [s.name, k, v || PLACEHOLDER]),
  );
  sections.push({
    id: "fluxo",
    title: "3. Fluxo atual e gargalos",
    paras: [
      {
        text: "O fluxo (as-is) descreve como o processo ocorre hoje, e a ficha de sistema registra o que entra, o que sai e onde aparecem os erros. A coluna “Onde trava” alimenta a matriz GUT.",
        evidence: [{ label: "Ficha 3", ref: "ficha3" }, { label: "Ficha 4", ref: "ficha4" }],
      },
    ],
    table: {
      caption: "Fluxo atual",
      head: ["Fluxo", "Etapa", "Quem faz", "Documento ou sistema", "Prazo", "Onde trava"],
      rows: flowRows,
    },
  });
  sections.push({
    id: "gut",
    title: "3.1 Gargalos priorizados (matriz GUT)",
    paras: [
      {
        text: "Prioridade calculada por gravidade × urgência × tendência (1 a 5). Alta ≥ 60; média 30–59; baixa < 30.",
        evidence: [{ label: "Matriz GUT", ref: "gut" }],
      },
    ],
    table: {
      caption: "Matriz GUT",
      head: ["Gargalo", "Origem / evidência", "Pontuação", "Prioridade"],
      rows: gut.map((g) => [g.title, g.origin, String(g.score), g.priority]),
      priority: gut.map((g) => g.priority),
    },
  });
  sections.push({
    id: "sistemas",
    title: "3.2 Fichas de sistemas",
    paras: [{ text: "Registro do SISPROEX, do sistema de iniciação científica e de outros sistemas usados no setor.", evidence: [{ label: "Ficha 4", ref: "ficha4" }] }],
    table: { head: ["Sistema", "Campo", "Anotação"], rows: systemsRows },
  });

  // 4. Porter
  const porterRows = (["clientes", "fornecedores", "concorrentes", "novosEntrantes", "substitutos"] as const).flatMap((k) => {
    const items = input.matrices.porter[k];
    return items.length
      ? items.map((i) => [labelPorter(k), i.text, i.evidence || PLACEHOLDER])
      : [[labelPorter(k), PLACEHOLDER, PLACEHOLDER]];
  });
  sections.push({
    id: "porter",
    title: "4. Análise de Porter",
    paras: [
      {
        text: "As cinco forças foram levantadas pelo estagiário e validadas com a coordenação. Cada item indica a fonte.",
        evidence: [{ label: "Matriz de Porter", ref: "porter" }, { label: "Ficha 7 - Diário de campo", ref: `diario(${input.diaryCount})` }],
      },
    ],
    table: { head: ["Força", "Item", "Evidência"], rows: porterRows },
  });

  // 5. SWOT
  const swotIssues = validateSwot(input.matrices);
  const linkedStrength = (o: Matrices["swot"]["forcas"][number]) => input.matrices.swot.forcas.find((f) => f.id === o.linkedStrengthId)?.text;
  sections.push({
    id: "swot",
    title: "5. MATRIZ SWOT",
    paras: [
      {
        text:
          "Forças e fraquezas são fatores internos ao setor; oportunidades e ameaças são externos. " +
          "Uma oportunidade só é listada quando o setor tem uma força interna capaz de aproveitá-la; " +
          "uma fraqueza não é repetida como oportunidade.",
        evidence: [{ label: "SWOT", ref: "swot" }],
      },
      ...(swotIssues.length
        ? [{ text: swotIssues.map((i) => `${i.level === "erro" ? "Erro" : "Atenção"}: ${i.text}`).join(" "), kind: "warn" as const }]
        : []),
    ],
    table: {
      head: ["Quadrante", "Natureza", "Item", "Força interna associada / evidência"],
      rows: [
        ...input.matrices.swot.forcas.map((f) => ["Forças", "Interno", f.text, f.evidence || PLACEHOLDER]),
        ...input.matrices.swot.fraquezas.map((f) => ["Fraquezas", "Interno", f.text, f.evidence || PLACEHOLDER]),
        ...input.matrices.swot.oportunidades.map((o) => [
          "Oportunidades",
          "Externo",
          o.text,
          linkedStrength(o) ? `Aproveitada pela força: ${linkedStrength(o)}` : PLACEHOLDER,
        ]),
        ...input.matrices.swot.ameacas.map((a) => ["Ameaças", "Externo", a.text, a.evidence || PLACEHOLDER]),
      ],
    },
  });

  // 6. Plano 5W2H + PDCA
  sections.push({
    id: "plano",
    title: "6. Plano de melhoria (5W2H e PDCA)",
    paras: [
      {
        text:
          `Ideia inicial: ${input.improvement.idea || PLACEHOLDER}. As ações foram ajustadas pelos resultados dos questionários ` +
          `(ver “Próximos passos”) e pelo diário de campo (${input.diaryCount} registro(s)).`,
        evidence: [{ label: "Ficha 6", ref: "ficha6" }, { label: "Ficha 7 - Diário de campo", ref: "ficha7" }],
      },
    ],
    table: {
      caption: "5W2H",
      head: ["5W2H", "Proposta"],
      rows: Object.entries(input.improvement.fiveW2H).map(([k, v]) => [capitalize(k), v || PLACEHOLDER]),
      status: Object.values(input.improvement.fiveW2H).map((v) => (isPlaceholder(v) ? "pendente" : "ok")),
    },
  });
  sections.push({
    id: "pdca",
    title: "6.1 Acompanhamento (PDCA)",
    paras: [{ text: "Etapas de acompanhamento da melhoria proposta.", evidence: [{ label: "Ficha 6 - PDCA", ref: "ficha6" }] }],
    table: {
      head: ["PDCA", "Acompanhamento"],
      rows: Object.entries(input.improvement.pdca).map(([k, v]) => [capitalize(k), v || PLACEHOLDER]),
    },
  });

  // 7. Procedimentos
  sections.push({
    id: "procedimentos",
    title: "7. Procedimentos e base normativa",
    paras: [{ text: "Procedimentos mapeados e o instrumento normativo de referência.", evidence: [{ label: "Ficha 5", ref: "ficha5" }] }],
    table: {
      head: ["Procedimento", "Base normativa", "Responsável", "Prazo"],
      rows: input.procedures.map((p) => [p.procedure, p.base || PLACEHOLDER, p.responsible || PLACEHOLDER, p.deadline || PLACEHOLDER]),
      status: input.procedures.map((p) =>
        isPlaceholder(p.base) || isPlaceholder(p.responsible) || isPlaceholder(p.deadline) ? "pendente" : "ok",
      ),
    },
  });

  // 8. Próximos passos
  sections.push({
    id: "proximos",
    title: "8. Próximos passos",
    paras: [{ text: "Cinco ações priorizadas a partir dos resultados, do plano de melhoria e da matriz GUT.", evidence: [{ label: "Ficha 6 + Matriz GUT + Questionários", ref: "plan" }] }],
    table: {
      head: ["#", "Ação", "Responsável sugerido", "Prazo", "Base"],
      rows: nextSteps.map((s, i) => [String(i + 1), s.action, s.owner, s.deadline, s.basis]),
    },
  });

  // 9. Limitações
  sections.push({
    id: "limitacoes",
    title: "9. Limitações e dados faltantes",
    paras: [
      {
        text:
          "As respostas são anônimas e agregadas: não é possível relacionar uma resposta a um respondente. " +
          "Os percentuais são descritivos e não representam estimativas da população, especialmente quando a amostra é pequena. " +
          `Prints e número de acessos ao link não são usados como medida de alcance.`,
        kind: "warn",
      },
      {
        text: missing.length
          ? missing.length === 1
            ? "1 campo ainda sem preenchimento está listado abaixo e aparece como [preencher] no relatório."
            : `${missing.length} campos ainda sem preenchimento estão listados abaixo e aparecem como [preencher] no relatório.`
          : "Todas as fichas obrigatórias estão preenchidas.",
        evidence: [{ label: "Fichas 1 a 6 e matrizes", ref: "missing" }],
      },
    ],
    lists: [
      ...(missing.length
        ? [
            {
              title: "Campos a preencher",
              items: [
                ...missing.slice(0, LIMITE_LISTA_FALTANTES).map((m) => (m.where ? `${m.where}: ${m.field}` : m.field)),
                ...(missing.length > LIMITE_LISTA_FALTANTES
                  ? [`e mais ${missing.length - LIMITE_LISTA_FALTANTES} campos, contados no status do relatório`]
                  : []),
              ],
            },
          ]
        : []),
      ...(input.themeGroups.length
        ? [{ title: "Respostas abertas por tema (sugestão)", items: input.themeGroups.map((g) => `${g.label}: ${g.count}`) }]
        : []),
    ],
  });

  return {
    title: "Relatório de diagnóstico do NUPE",
    subtitle: "Estágio no Núcleo de Pesquisa e Extensão - UNEB Campus XXI (DCHT XXI), Ipiaú",
    generatedAt: input.generatedAt,
    sections,
    missing,
    gut,
    nextSteps,
    status: missing.length === 0 ? "completo" : "incompleto",
  };
}

function summarizeQuestion(s: AudienceSummary, q: QuestionResult, aud: string): string {
  const prefixo = `Q${q.number} ${aud}:`;
  // Sem resposta a frase diz só isso. Repetir "sem respostas - sem respostas",
  // ou mostrar "média - (n=0)", faz o relatório parecer quebrado.
  if (q.answered === 0) return `${prefixo} sem respostas`;

  if (q.type === "scale") {
    const media =
      q.scale?.mean !== null && q.scale?.mean !== undefined
        ? String(q.scale.mean).replace(".", ",")
        : PLACEHOLDER;
    const nota = q.showPercent ? "" : " - amostra pequena, apenas contagens";
    return `${prefixo} média ${media} (n=${q.answered})${nota}`;
  }

  const top = topOptions(q, 3).filter((o) => o.count > 0);
  const partes = top.map((o) => `${o.label} ${o.count}${o.percent !== null ? ` (${fmtPct(o.percent)})` : ""}`);
  const aviso = !q.showPercent && partes.length ? " - amostra pequena, apenas contagens" : "";
  return `${prefixo} ${partes.join("; ")}${aviso}`;
}

function capitalize(s: string): string {
  const map: Record<string, string> = {
    oQue: "O quê",
    porQue: "Por quê",
    quem: "Quem",
    onde: "Onde",
    quando: "Quando",
    como: "Como",
    quanto: "Quanto",
    planejar: "Planejar",
    fazer: "Fazer",
    checar: "Checar",
    ajustar: "Ajustar",
  };
  return map[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}
