import type { Audience, Question, Survey } from "./surveys";
import { chaveOutro, LIMITE_OUTRO } from "./surveys";

export const MIN_SAMPLE_FOR_PERCENT = 5;

export type RawAnswers = Record<string, string | string[] | number | null | undefined>;

export interface OptionResult {
  code: string;
  label: string;
  count: number;
  /** % sobre o total de respostas à pergunta (ou % de quem marcou, em múltipla). */
  percent: number | null;
}

export interface QuestionResult {
  questionId: string;
  number: number;
  text: string;
  type: Question["type"];
  /** Quantidade de questionários que responderam esta pergunta (válidos). */
  answered: number;
  /** Quantidade de questionários recebidos do público (inclui pular opcional). */
  total: number;
  showPercent: boolean;
  options: OptionResult[];
  /** Escala: média aritmética, mediana e distribuição por valor. */
  scale?: {
    mean: number | null;
    median: number | null;
    distribution: Array<{ value: number; count: number; percent: number | null }>;
  };
  openTexts?: string[];
}

export interface AudienceSummary {
  audience: Audience;
  total: number;
  showPercent: boolean;
  questions: QuestionResult[];
}

export function normalizeScale(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) return v;
  if (typeof v === "string" && /^[1-5]$/.test(v)) return Number(v);
  return null;
}

function asCodes(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function pct(count: number, base: number): number | null {
  if (base < MIN_SAMPLE_FOR_PERCENT) return null;
  return Math.round((count / base) * 1000) / 10;
}

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function analyzeQuestion(
  surveyQuestion: Question,
  answers: RawAnswers[],
  totalResponses: number,
): QuestionResult {
  const base: QuestionResult = {
    questionId: surveyQuestion.id,
    number: surveyQuestion.number,
    text: surveyQuestion.text,
    type: surveyQuestion.type,
    answered: 0,
    total: totalResponses,
    showPercent: false,
    options: [],
  };

  if (surveyQuestion.type === "scale") {
    const values = answers.map((a) => normalizeScale(a[surveyQuestion.id])).filter((v): v is number => v !== null);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    base.scale = {
      mean: values.length ? round1(sum / values.length) : null,
      median: median(sorted),
      distribution: [1, 2, 3, 4, 5].map((value) => {
        const count = values.filter((v) => v === value).length;
        return { value, count, percent: pct(count, values.length) };
      }),
    };
    base.answered = values.length;
    base.showPercent = values.length >= MIN_SAMPLE_FOR_PERCENT;
    base.openTexts = textosLivres(surveyQuestion, answers);
    return base;
  }

  if (surveyQuestion.type === "open") {
    const texts = answers
      .map((a) => a[surveyQuestion.id])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    base.answered = texts.length;
    base.openTexts = texts;
    return base;
  }

  const options = surveyQuestion.options ?? [];
  const counts = new Map<string, number>(options.map((o) => [o.code, 0]));
  let answered = 0;
  let soEscrito = 0;
  for (const a of answers) {
    const codes = asCodes(a[surveyQuestion.id]).filter((c) => counts.has(c));
    if (codes.length === 0) {
      // Quem só escreveu (não marcou opção) conta como resposta à pergunta, mas
      // não pode inflar opção nenhuma.
      if (textoLivre(surveyQuestion, a)) {
        answered += 1;
        soEscrito += 1;
      }
      continue;
    }
    answered += 1;
    // Em múltipla, o mesmo respondente não conta duas vezes a mesma opção.
    for (const code of new Set(codes)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  base.answered = answered;
  // A regra é por pergunta: a pergunta só libera percentual quando ela própria
  // reuniu pelo menos 5 respostas, mesmo que o público tenha mais.
  base.showPercent = answered >= MIN_SAMPLE_FOR_PERCENT;
  base.options = options.map((o) => {
    const count = counts.get(o.code) ?? 0;
    return { code: o.code, label: o.label, count, percent: pct(count, answered) };
  });
  // Só aparece a linha do "outro" quando alguém escreveu, para não sugerir
  // uma opção que o questionário não oferece.
  const escritos = textosLivres(surveyQuestion, answers);
  if (escritos.length > 0) base.options.push({ code: "outro", label: "Outro (texto livre)", count: soEscrito, percent: pct(soEscrito, answered) });
  base.openTexts = escritos;
  return base;
}

function textoLivre(q: Question, a: RawAnswers): string {
  if (!q.outro) return "";
  const v = a[chaveOutro(q.id)];
  return typeof v === "string" ? scrubOpenText(v, LIMITE_OUTRO) : "";
}

function textosLivres(q: Question, answers: RawAnswers[]): string[] {
  return answers.map((a) => textoLivre(q, a)).filter((t) => t.length > 0);
}

export function labelFor(question: Question, code: string): string {
  return question.options?.find((o) => o.code === code)?.label ?? code;
}

export function analyzeAudience(
  survey: Survey,
  entries: Array<{ answers: RawAnswers }>,
): AudienceSummary {
  const answers = entries.map((e) => e.answers);
  return {
    audience: survey.audience,
    total: entries.length,
    showPercent: entries.length >= MIN_SAMPLE_FOR_PERCENT,
    questions: survey.questions.map((q) => analyzeQuestion(q, answers, entries.length)),
  };
}

/** Valida um envio: obrigatórias respondidas e códigos existentes. Retorna lista de erros. */
export function validateSubmission(
  survey: Survey,
  answers: RawAnswers,
  limits = { maxOpen: 1200 },
): string[] {
  const errors: string[] = [];
  for (const q of survey.questions) {
    const v = answers[q.id];
    const outro = answers[chaveOutro(q.id)];
    const empty =
      v == null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);

    // O texto do "outro" vale como resposta quando a pessoa não marca opção.
    const escrito = typeof outro === "string" ? outro.trim() : "";
    if (escrito.length > LIMITE_OUTRO) {
      errors.push(`Resposta ${q.number} acima do limite de ${LIMITE_OUTRO} caracteres.`);
    }

    if (q.optional) {
      if (q.type === "open" && typeof v === "string" && v.length > limits.maxOpen) {
        errors.push(`Resposta ${q.number} acima do limite de ${limits.maxOpen} caracteres.`);
      }
      if (!empty && !escrito && q.type !== "open" && !isValidValue(q, v)) {
        errors.push(`Resposta ${q.number} inválida.`);
      }
      continue;
    }

    if (empty && !escrito) {
      errors.push(`Responda a pergunta ${q.number}.`);
      continue;
    }
    if (q.type === "open" && typeof v === "string" && v.length > limits.maxOpen) {
      errors.push(`Resposta ${q.number} acima do limite de ${limits.maxOpen} caracteres.`);
    }
    if (!empty && q.type !== "open" && !isValidValue(q, v)) {
      errors.push(`Resposta ${q.number} inválida.`);
    }
  }
  return errors;
}

function isValidValue(q: Question, v: unknown): boolean {
  if (q.type === "scale") return normalizeScale(v) !== null;
  if (q.type === "single") return typeof v === "string" && (q.options ?? []).some((o) => o.code === v);
  if (q.type === "multi") {
    if (!Array.isArray(v) || v.length === 0) return false;
    const codes = new Set((q.options ?? []).map((o) => o.code));
    return v.every((c) => typeof c === "string" && codes.has(c));
  }
  return true;
}

/** Trunca respostas abertas a um teto de caracteres para reduzir dado pessoal acidental. */
export function scrubOpenText(text: string, max = 1200): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}
