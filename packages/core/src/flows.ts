/** Pontuação de gargalos (matriz GUT) - implementação pura e testável. */

export interface GutScores {
  gravity: number;
  urgency: number;
  tendency: number;
}

export function gutScore(s: GutScores): number {
  return clamp5(s.gravity) * clamp5(s.urgency) * clamp5(s.tendency);
}

export function gutPriority(score: number): "Alta" | "Média" | "Baixa" {
  if (score >= 60) return "Alta";
  if (score >= 30) return "Média";
  return "Baixa";
}

function clamp5(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function sortByGut<T extends { gut: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.gut - a.gut);
}

/**
 * Sugestão de prioridade a partir da frequência de respostas (questionário da equipe):
 * quantas vezes um problema aparece em várias perguntas/fontes.
 */
export function frequencyScore(counts: number[]): number {
  return counts.reduce((acc, n) => acc + n, 0);
}
