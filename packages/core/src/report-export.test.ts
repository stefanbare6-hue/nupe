import { describe, expect, it } from "vitest";
import { formatDate, renderReportBody, renderReportDocument, renderWordDocument } from "./report-export";
import { buildReport, type ReportInput } from "./report-model";
import { analyzeAudience } from "./stats";
import { DOCENTES, EQUIPE, ESTUDANTES } from "./surveys";

const entrada: ReportInput = {
  generatedAt: "2026-11-04T12:00:00.000Z",
  period: "agosto a novembro de 2026",
  summaries: {
    docentes: analyzeAudience(DOCENTES, []),
    estudantes: analyzeAudience(ESTUDANTES, []),
    equipe: analyzeAudience(EQUIPE, []),
  },
  institution: { fields: { missao: "Apoiar <pesquisa> & extensão" }, numbers: [] },
  flows: [],
  systems: [],
  matrices: {
    porter: { clientes: [], fornecedores: [], concorrentes: [], novosEntrantes: [], substitutos: [] },
    swot: { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] },
    gut: [{ id: "g1", text: "Prazos", gravity: 5, urgency: 5, tendency: 5 }],
    notes: {},
  },
  improvement: { idea: "", fiveW2H: {}, pdca: {} },
  procedures: [],
  diaryCount: 0,
  themeGroups: [],
  audienceLabels: { docentes: "Docentes", estudantes: "Estudantes", equipe: "Equipe do NUPE" },
};

const modelo = buildReport(entrada);

describe("exportação do relatório", () => {
  it("escapa o texto digitado nas fichas", () => {
    const html = renderReportBody(modelo);
    expect(html).toContain("Apoiar &lt;pesquisa&gt; &amp; extensão");
    expect(html).not.toContain("<pesquisa>");
  });

  it("repete as nove seções numeradas no corpo exportado", () => {
    const html = renderReportBody(modelo);
    const titulos = [...html.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(titulos).toHaveLength(modelo.sections.length);
    expect(titulos.filter((t) => /^\d\.\s/.test(t!))).toHaveLength(9);
  });

  it("destaca a prioridade alta e as células vazias", () => {
    const html = renderReportBody(modelo);
    expect(html).toContain('class="cell-high"');
    expect(html).toContain('class="cell-pending"');
  });

  it("gera documento HTML autônomo com A4 e charset", () => {
    const doc = renderReportDocument(modelo);
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain("size: A4");
    // Rodapé no fim do documento, com a data de geração.
    expect(doc).toContain('<footer class="pe">');
    expect(doc).toContain("Fim do relatório");
    expect(doc).toContain("</html>");
  });

  it("gera o arquivo do Word com a moldura da Microsoft e sem CSS de impressão", () => {
    const word = renderWordDocument(modelo);
    expect(word).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(word).toContain('div class="Section1"');
    expect(word).toContain("size: 21cm 29.7cm");
    expect(word).not.toContain("@media print");
  });

  it("formata a data em português", () => {
    expect(formatDate("2026-11-04T12:00:00.000Z")).toMatch(/de novembro de 2026/);
    expect(formatDate("data-invalida")).toBe("data-invalida");
  });
});
