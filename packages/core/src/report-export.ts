/** Renderiza o relatório como HTML autônomo (para Word: .doc; para PDF: CSS de impressão). */
import type { ReportModel } from "./report-model";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cls(row: string[] | undefined, i: number, name: "status" | "priority"): string {
  const v = row?.[i];
  if (name === "status") return v === "pendente" ? "cell-pending" : "";
  return v === "Alta" ? "cell-high" : v === "Média" ? "cell-mid" : v === "Baixa" ? "cell-low" : "";
}

export const REPORT_STYLE = `
.report { font-family: Georgia, "Times New Roman", serif; color: #14213d; line-height: 1.55; font-size: 15px; }
.report h1 { font-size: 26px; margin: 0 0 6px; }
.report h2 { font-size: 19px; margin: 32px 0 10px; border-bottom: 2px solid #b34d17; padding-bottom: 4px; }
.report h3 { font-size: 15px; margin: 16px 0 4px; }
.report .sub { color: #3f4a63; margin: 0 0 4px; }
.report .meta { color: #565f76; font-size: 13px; margin: 0 0 24px; }
.report table { border-collapse: collapse; width: 100%; margin: 10px 0 18px; font-size: 13.5px; font-family: "Segoe UI", Arial, sans-serif; }
.report caption { text-align: left; font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #14213d; }
.report th, .report td { border: 1px solid #c9cfdb; padding: 7px 9px; vertical-align: top; text-align: left; }
.report th { background: #14213d; color: #fff; font-weight: 600; }
.report tr:nth-child(even) td { background: #f7f8fb; }
.report .cell-pending { color: #8a5100; background: #fff6e6 !important; font-style: italic; }
.report .cell-high { color: #9a1b1b; font-weight: 700; }
.report .cell-mid { color: #8a5100; font-weight: 600; }
.report ul { margin: 6px 0 16px; padding-left: 20px; }
.report li { margin: 3px 0; }
.report .note { background: #f1f4fa; border-left: 4px solid #1d3557; padding: 10px 14px; }
.report .warn { background: #fff6e6; border-left: 4px solid #b34d17; padding: 10px 14px; }
.report .ev { display: block; font-size: 11.5px; color: #4b5671; font-family: "Segoe UI", Arial, sans-serif; margin-top: 4px; }
.report .ev b { font-weight: 600; }
.pe { margin-top: 28px; padding-top: 8px; border-top: 1px solid #c9cfdb; }
.pe p { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #4b5671; margin: 0; }
@media print {
  .report { font-size: 11.5pt; }
  .report h2 { page-break-after: avoid; }
  .report table { page-break-inside: auto; }
  .report tr { page-break-inside: avoid; }
  /* A evidência continua em linha própria, como na tela: nunca colada ao ponto. */
  .report .ev { display: block; margin-top: 3px; }
  a { color: inherit; text-decoration: none; }
}
`;

export function renderReportBody(model: ReportModel): string {
  const parts: string[] = [];
  parts.push(`<header class="report">`);
  parts.push(`<h1>${esc(model.title)}</h1>`);
  parts.push(`<p class="sub">${esc(model.subtitle)}</p>`);
  parts.push(
    `<p class="meta">Gerado em ${esc(formatDate(model.generatedAt))} · Status: ${model.status === "completo" ? "completo" : `incompleto (${model.missing.length} ${model.missing.length === 1 ? "campo" : "campos"} a preencher)`}</p>`,
  );
  parts.push(`</header>`);

  for (const s of model.sections) {
    parts.push(`<section class="report"><h2 id="${esc(s.id)}">${esc(s.title)}</h2>`);
    for (const p of s.paras) {
      const c = p.kind === "warn" ? "warn" : p.kind === "note" ? "note" : "";
      const ev = p.evidence?.length
        ? `<span class="ev">Evidência: ${p.evidence.map((e) => `<b>${esc(e.label)}</b>`).join("; ")}</span>`
        : "";
      parts.push(`<p class="${c}">${esc(p.text)}${ev}</p>`);
    }
    if (s.table) {
      const t = s.table;
      parts.push(`<table>${t.caption ? `<caption>${esc(t.caption)}</caption>` : ""}<thead><tr>${t.head
        .map((h) => `<th scope="col">${esc(h)}</th>`)
        .join("")}</tr></thead><tbody>`);
      for (const row of t.rows) {
        const isPri = t.head.includes("Prioridade");
        parts.push(
          `<tr>${row
            .map((cell, i) => {
              const klass = isPri ? cls(row, i, "priority") : t.status ? cls(t.status, i, "status") : "";
              return `<td class="${klass}">${esc(cell)}</td>`;
            })
            .join("")}</tr>`,
        );
      }
      parts.push(`</tbody></table>`);
    }
    if (s.lists) {
      for (const l of s.lists) {
        parts.push(`<h3>${esc(l.title)}</h3><ul>${l.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
      }
    }
    parts.push(`</section>`);
  }
  return parts.join("\n");
}

export function renderReportDocument(model: ReportModel, title = model.title): string {
  // Margem do papel. O rodapé fica no fim do corpo porque o motor de PDF do
  // navegador não desenha as caixas de margem de @page (counter(page) etc.).
  const papel = `@page { size: A4; margin: 18mm 16mm; }`;
  const rodape =
    `<footer class="pe"><p>Documento gerado pelo sistema do NUPE em ${esc(formatDate(model.generatedAt))}. ` +
    `Fim do relatório.</p></footer>`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${papel} body { margin: 0; padding: 0; background: #fff; } ${REPORT_STYLE}</style>
</head><body>${renderReportBody(model)}${rodape}</body></html>`;
}

/** Word abre HTML com extensão .doc. Inclui metadados de página A4. */
export function renderWordDocument(model: ReportModel): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(model.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: 21cm 29.7cm; margin: 2cm 2cm 2cm 2cm; mso-page-orientation: portrait; }
div.Section1 { page: Section1; }
body { background: #fff; }
${REPORT_STYLE.replace(/@media print[\s\S]*$/, "")}
</style></head>
<body><div class="Section1">${renderReportBody(model)}</div></body></html>`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
