/**
 * Agrupamento automático (sugestão) das respostas abertas por tema.
 * Marcação por palavra-chave: simples, determinística e auditável.
 * O estagiário pode corrigir o tema de cada resposta; a correção prevalece.
 */
import type { OpenResponse } from "./types";

export interface ThemeWithKeywords {
  id: string;
  label: string;
  keywords: string[];
}

export const SUGGESTED_THEMES: ThemeWithKeywords[] = [
  {
    id: "comunicacao",
    label: "Comunicação e avisos",
    keywords: [
      "whatsapp",
      "aviso",
      "avisar",
      "comunicar",
      "comunicação",
      "informar",
      "informação",
      "email",
      "e-mail",
      "mensagem",
      "divulgação",
      "divulgar",
      "mural",
      "cartaz",
      "instagram",
      "canal",
    ],
  },
  {
    id: "prazos",
    label: "Prazos e calendário",
    keywords: [
      "prazo",
      "calendário",
      "cronograma",
      "antecedência",
      "dia",
      "data",
      "atraso",
      "atrasar",
      "tempo",
      "mensal",
      "recorde",
    ],
  },
  {
    id: "sistema",
    label: "Sistema e SISPROEX",
    keywords: ["sisproex", "sistema", "plataforma", "site", "senha", "login", "erro", "acesso", "online", "formulário", "url"],
  },
  {
    id: "documentos",
    label: "Documentos e burocracia",
    keywords: ["documento", "papel", "burocracia", "formulário", "anexo", "assinatura", "prestação", "conta", "relatório", "comprovante", "declaração"],
  },
  {
    id: "capacitacao",
    label: "Orientação e capacitação",
    keywords: ["capacitação", "treinamento", "oficina", "curso", "orientação", "orientar", "explicar", "manual", "tutorial", "como começar"],
  },
  {
    id: "divulgacao_alunos",
    label: "Divulgação entre estudantes",
    keywords: ["estudante", "aluno", "sala", "aula", "professor", "monitoria", "iniciação", "científica", "palestra", "apresentar"],
  },
  {
    id: "instalacoes",
    label: "Espaço físico e materiais",
    keywords: ["sala", "espaço", "computador", "internet", "material", "impressora", "equipamento"],
  },
  {
    id: "recursos",
    label: "Recursos e bolsas",
    keywords: ["bolsa", "recurso", "verba", "financeiro", "edital", "custo", "transporte"],
  },
];

export function suggestThemeIds(text: string, themes: ThemeWithKeywords[] = SUGGESTED_THEMES): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  const scored = themes
    .map((t) => {
      const hits = t.keywords.filter((k) => normalized.includes(normalize(k))).length;
      return { id: t.id, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (scored.length === 0) return [];
  const maxHits = scored[0]!.hits;
  // Aceita todos os temas com a mesma pontuação máxima (respostas híbridas).
  return scored.filter((s) => s.hits === maxHits).map((s) => s.id);
}

/**
 * Tema efetivo de uma resposta aberta. A correção manual tem prioridade; string
 * vazia é uma correção manual para "sem tema" (não volta a sugestão automática).
 */
export function effectiveThemeIds(r: Pick<OpenResponse, "manualThemeId" | "themeIds">): string[] {
  if (r.manualThemeId === null || r.manualThemeId === undefined) return r.themeIds;
  return r.manualThemeId === "" ? [] : [r.manualThemeId];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractKeywords(text: string): string[] {
  const stop = new Set([
    "que", "para", "com", "dos", "das", "uma", "por", "mais", "como", "nos", "nas", "sem", "não", "nao",
    "sobre", "pelo", "pela", "também", "tambem", "muito", "todo", "toda", "isso", "esse", "essa", "este",
    "esta", "ser", "estar", "ter", "tem", "foi", "são", "sao", "nao", "aos", "aum", "e/ou", "the", "and",
  ]);
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4 && !stop.has(w));
}

export const UNCLASSIFIED_THEME_ID = "sem-tema";
