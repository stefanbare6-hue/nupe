import type { Audience } from "./surveys";

export type CollectionStatus = "rascunho" | "aberta" | "encerrada";

export interface Collection {
  id: string;
  publicId: string | null;
  audience: Audience;
  status: CollectionStatus;
  /** Rótulo interno para o estagiário, ex.: "1ª coleta — novembro/2026". */
  label: string;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  demo?: boolean;
  responses: number;
}

export interface AnswerValue {
  questionId: string;
  /** Texto (aberta), código (única) ou lista de códigos (múltipla). Escala é número de 1 a 5. */
  value: string | string[] | number | null;
}

export interface Entry {
  id: string;
  collectionId: string;
  submittedAt: string;
  answers: AnswerValue[];
}

export interface OpenResponse {
  id: string;
  entryId: string;
  collectionId: string;
  audience: Audience;
  questionId: string;
  text: string;
  themeIds: string[];
  /** Tema definido manualmente pelo estagiário (não é recalculado). */
  manualThemeId: string | null;
  createdAt: string;
}

export interface Theme {
  id: string;
  label: string;
  keywords: string[];
  description?: string;
}

// ───────────────────────── Fichas de campo ─────────────────────────

export type FieldRecordKind =
  | "institution"
  | "numbers"
  | "systems"
  | "procedures"
  | "improvement"
  | "glossary"
  | "matrices";

export interface FlowStep {
  id: string;
  stage: string;
  who: string;
  docSystem: string;
  deadline: string;
  blocker: string;
}

export interface Flow {
  id: string;
  name: string;
  process: string;
  steps: FlowStep[];
}

export interface DiaryRow {
  id: string;
  date: string;
  observation: string;
  source: string;
  question: string;
}

export interface GlossaryRow {
  id: string;
  acronym: string;
  meaning: string;
  source: string;
}

export interface SystemRecord {
  id: string;
  name: string;
  fields: Record<string, string>;
}

export interface Improvement {
  idea: string;
  fiveW2H: Record<string, string>;
  pdca: Record<string, string>;
}

export interface NumbersRow {
  id: string;
  indicator: string;
  value: string;
  source: string;
}
