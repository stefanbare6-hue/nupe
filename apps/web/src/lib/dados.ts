/** Tipos das respostas da API e carregadores usados pelas telas. */
import type { AudienceSummary, Collection, Theme } from "@nupe/core";
import { api } from "./http";

export interface MeView {
  name: string;
  email: string;
  displayName: string;
  settings: Settings;
}

export interface Settings {
  displayName: string;
  startDate: string;
  endDate: string;
  supervisor: string;
  course: string;
  updatedAt: string;
  rateLimitPerHour: number;
}

export interface DashboardView {
  counts: Array<{ audience: string; total: number }>;
  collections: Collection[];
  recent: string[];
  visits: Array<{ date: string; count: number }>;
  demo: string | null;
  missing: number;
  log: Array<{ at: string; action: string; detail?: string }>;
}

export interface ThemeGroup {
  label: string;
  count: number;
  examples: string[];
}

export interface ResultsView {
  summary: AudienceSummary;
  themes: ThemeGroup[];
  openResponses: Array<{ id: string; questionId: string; text: string; themeIds: string[]; manual: boolean }>;
  /** Total recebido por público, para as abas mostrarem números mesmo antes de abrir a aba. */
  totals?: Record<string, number>;
}

export interface RecordsView {
  institution: { fields: Record<string, string>; numbers: Array<Record<string, string>>; updatedAt: string };
  flows: Array<{
    id: string;
    name: string;
    process: string;
    steps: Array<{ id: string; stage: string; who: string; docSystem: string; deadline: string; blocker: string }>;
  }>;
  systems: Array<{ id: string; name: string; fields: Record<string, string> }>;
  procedures: Array<{ id: string; procedure: string; base: string; responsible: string; deadline: string }>;
  improvement: { idea: string; fiveW2H: Record<string, string>; pdca: Record<string, string> };
  diary: Array<{ id: string; date: string; observation: string; source: string; question: string }>;
  glossary: Array<{ id: string; acronym: string; meaning: string; source: string }>;
  matrices: import("@nupe/core").Matrices;
  settings: Settings;
}

export interface ReportView {
  report: import("@nupe/core").ReportModel;
}

export interface ThemeFull extends Theme {}

export const carregar = {
  me: () => api.get<MeView>("/api/me"),
  dashboard: () => api.get<DashboardView>("/api/dashboard"),
  results: (audience: string) => api.get<ResultsView>(`/api/results/${audience}`),
  records: () => api.get<RecordsView>("/api/records"),
  report: () => api.get<ReportView>("/api/report"),
  themes: () => api.get<{ themes: ThemeFull[] }>("/api/themes").catch(() => ({ themes: [] as ThemeFull[] })),
};
