/** Formatação em português do Brasil. */

export function numero(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function decimal(v: number | null | undefined): string {
  return numero(v, 1);
}

export function percentual(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${decimal(v)}%`;
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function prazo(iso: string | null | undefined): string {
  if (!iso) return "sem prazo definido";
  const d = new Date(iso);
  const dias = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return `encerrou em ${dataCurta(iso)}`;
  if (dias === 0) return "encerra hoje";
  if (dias === 1) return "encerra amanhã";
  return `encerra em ${dias} dias (${dataCurta(iso)})`;
}

export function rotuloPublico(a: string): string {
  return { docentes: "Docentes", estudantes: "Estudantes", equipe: "Equipe do NUPE" }[a] ?? a;
}
