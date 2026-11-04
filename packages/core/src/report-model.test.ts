import { describe, expect, it } from "vitest";
import { buildReport, buildMissing, computeGut, validateSwot, type ReportInput } from "./report-model";
import { analyzeAudience } from "./stats";
import { DOCENTES, ESTUDANTES, EQUIPE } from "./surveys";
import type { Matrices } from "./forms";
import { PLACEHOLDER } from "./forms";

function matricesVazias(): Matrices {
  const lista = () => [];
  return {
    porter: { clientes: lista(), fornecedores: lista(), concorrentes: lista(), novosEntrantes: lista(), substitutos: lista() },
    swot: { forcas: lista(), fraquezas: lista(), oportunidades: lista(), ameacas: lista() },
    gut: [],
    notes: {},
  };
}

function entrada(over: Partial<ReportInput> = {}): ReportInput {
  return {
    generatedAt: "2026-11-04T12:00:00.000Z",
    period: "agosto a novembro de 2026",
    summaries: {
      docentes: analyzeAudience(DOCENTES, []),
      estudantes: analyzeAudience(ESTUDANTES, []),
      equipe: analyzeAudience(EQUIPE, []),
    },
    institution: { fields: {}, numbers: [] },
    flows: [],
    systems: [],
    matrices: matricesVazias(),
    improvement: { idea: "", fiveW2H: {}, pdca: {} },
    procedures: [],
    diaryCount: 0,
    themeGroups: [],
    audienceLabels: { docentes: "Docentes", estudantes: "Estudantes", equipe: "Equipe do NUPE" },
    ...over,
  };
}

const estudante = {
  e1: "letras",
  e2: ["extensao"],
  e3: "nao",
  e4: ["grupos"],
  e5: ["falta_informacao"],
  e6: 2,
  e7: "sim",
};

describe("relatório de diagnóstico", () => {
  it("tem as nove seções numeradas na ordem", () => {
    const r = buildReport(entrada());
    // O espaço depois do número é não separável (o título não quebra no meio).
    const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");
    const numeradas = r.sections.filter((s) => /^\d\.\s/.test(s.title)).map((s) => semNbsp(s.title));
    expect(numeradas).toEqual([
      "1. Resumo e amostra",
      "2. Levantamento institucional e números do setor",
      "3. Fluxo atual e gargalos",
      "4. Análise de Porter",
      "5. MATRIZ SWOT",
      "6. Plano de melhoria (5W2H e PDCA)",
      "7. Procedimentos e base normativa",
      "8. Próximos passos",
      "9. Limitações e dados faltantes",
    ]);
  });

  it("sem dados, marca o relatório como incompleto e lista o que falta", () => {
    const r = buildReport(entrada());
    expect(r.status).toBe("incompleto");
    expect(r.missing.length).toBeGreaterThan(10);
    const campos = r.missing.map((m) => m.field);
    expect(campos).toContain("Missão");
    expect(r.missing.some((m) => m.where.includes("Amostra"))).toBe(true);
    const limitacoes = r.sections.find((s) => s.id === "limitacoes")!;
    expect(limitacoes.lists?.[0]?.items.length).toBe(r.missing.length);
  });

  it("nunca inventa números nem nomes de pessoas", () => {
    const texto = JSON.stringify(buildReport(entrada()));
    // Sem respostas e sem fichas, nenhuma frase pode afirmar taxa, parcela ou pessoa.
    expect(texto).not.toMatch(/\d+% de/);
    expect(texto).not.toMatch(/Maria|João|Fulano/);
  });

  it("cita a amostra real e não libera percentual abaixo de 5 respostas", () => {
    const r = buildReport(
      entrada({ summaries: { docentes: analyzeAudience(DOCENTES, []), estudantes: analyzeAudience(ESTUDANTES, [{ answers: estudante }, { answers: estudante }]), equipe: analyzeAudience(EQUIPE, []) } }),
    );
    const resumo = r.sections.find((s) => s.id === "resumo")!;
    expect(resumo.paras[0]!.text).toContain("Foram recebidas 2 respostas");
    const linhas = resumo.table!.rows.find((row) => row[0] === "Estudantes")!;
    expect(linhas[1]).toBe("2");
    expect(linhas[2]).toMatch(/amostra pequena/i);
    const resultados = resumo.lists![0]!.items.filter((i) => i.includes("Estudantes"));
    expect(resultados.some((i) => /amostra pequena/.test(i))).toBe(true);
    expect(resultados.some((i) => /\((\d+,\d)%\)/.test(i))).toBe(false);
  });

  it("mostra percentual quando o público chega a 5 respostas", () => {
    const cinco = Array.from({ length: 5 }, () => ({ answers: estudante }));
    const r = buildReport(entrada({ summaries: { docentes: analyzeAudience(DOCENTES, []), estudantes: analyzeAudience(ESTUDANTES, cinco), equipe: analyzeAudience(EQUIPE, []) } }));
    const resultados = r.sections.find((s) => s.id === "resumo")!.lists![0]!.items.filter((i) => i.includes("Estudantes"));
    expect(resultados.some((i) => /\(\d+(,\d)?%\)/.test(i))).toBe(true);
    expect(resultados.every((i) => !/amostra pequena/.test(i))).toBe(true);
  });

  it("ordena a GUT pela pontuação e contrasta com a prioridade", () => {
    const m = matricesVazias();
    m.gut = [
      { id: "a", text: "Sem aviso dos prazos", gravity: 2, urgency: 2, tendency: 2 },
      { id: "b", text: "SISPROEX confuso", gravity: 5, urgency: 4, tendency: 4 },
    ];
    const gut = computeGut(entrada({ matrices: m }));
    expect(gut.map((g) => g.title)).toEqual(["SISPROEX confuso", "Sem aviso dos prazos"]);
    expect(gut[0]!.priority).toBe("Alta");
    expect(gut[1]!.priority).toBe("Baixa");
  });

  it("não lista gargalo sem nome no resumo", () => {
    const m = matricesVazias();
    m.gut = [{ id: "a", text: "", gravity: 4, urgency: 4, tendency: 4 }];
    const resumo = buildReport(entrada({ matrices: m })).sections.find((s) => s.id === "resumo")!;
    const texto = resumo.paras[1]!.text;
    expect(texto).not.toMatch(/tendência\):\s*\./);
    expect(texto).toContain("ainda não foi preenchida");
  });

  it("não repete \"sem respostas\" nem mostra média vazia em pergunta sem resposta", () => {
    const vazio = analyzeAudience(ESTUDANTES, []);
    const r = buildReport(
      entrada({ summaries: { docentes: analyzeAudience(DOCENTES, []), estudantes: vazio, equipe: analyzeAudience(EQUIPE, []) } }),
    );
    const itens = r.sections.find((s) => s.id === "resumo")!.lists![0]!.items;
    for (const item of itens) {
      expect(item).not.toMatch(/sem respostas\s*-\s*sem respostas/);
      expect(item).not.toMatch(/média\s*-\s*\(n=0\)/);
    }
  });

  it("leva o gargalo de maior pontuação para os próximos passos", () => {
    const m = matricesVazias();
    m.gut = [{ id: "b", text: "SISPROEX confuso", gravity: 5, urgency: 5, tendency: 5 }];
    const r = buildReport(entrada({ matrices: m, improvement: { idea: "Canal no WhatsApp", fiveW2H: { quando: "março" }, pdca: {} } }));
    const proximos = r.sections.find((s) => s.id === "proximos")!;
    expect(proximos.table!.rows).toHaveLength(5);
    expect(proximos.table!.rows.some((row) => row[1].includes("SISPROEX confuso"))).toBe(true);
    expect(proximos.table!.rows[0]![1]).toContain("Canal no WhatsApp");
    expect(proximos.table!.rows[0]![3]).toBe("março");
  });

  it("preenche as lacunas dos próximos passos com [preencher]", () => {
    const r = buildReport(entrada());
    for (const row of r.sections.find((s) => s.id === "proximos")!.table!.rows) {
      expect(row.some((c) => c === PLACEHOLDER)).toBe(true);
    }
  });

  it("cada afirmação com evidência traz referência", () => {
    const r = buildReport(entrada());
    const comEvidencia = r.sections.flatMap((s) => s.paras).filter((p) => p.evidence);
    expect(comEvidencia.length).toBeGreaterThan(5);
    for (const p of comEvidencia) for (const e of p.evidence!) expect(e.label.length > 0 && e.ref.length > 0).toBe(true);
  });

  it("lista campos das fichas e matrizes vazias", () => {
    const missing = buildMissing(entrada());
    const onde = new Set(missing.map((x) => x.where));
    expect(onde.has("Ficha 1 - Levantamento institucional")).toBe(true);
    expect(onde.has("Matriz de Porter")).toBe(true);
    expect(onde.has("SWOT")).toBe(true);
  });
});

describe("regra da SWOT", () => {
  it("recusa repetir fraqueza como oportunidade", () => {
    const m = matricesVazias();
    m.swot.fraquezas = [{ id: "f1", text: "Comunicação interna falha" }];
    m.swot.oportunidades = [{ id: "o1", text: "Comunicação interna falha" }];
    const issues = validateSwot(m);
    expect(issues.some((i) => i.level === "erro")).toBe(true);
  });

  it("avisa quando a oportunidade não indica a força que a aproveita", () => {
    const m = matricesVazias();
    m.swot.forcas = [{ id: "a1", text: "Equipe próxima dos estudantes" }];
    m.swot.oportunidades = [{ id: "o1", text: "Editais de extensão abertos pela pró-reitoria" }];
    const issues = validateSwot(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("aviso");
    m.swot.oportunidades[0]!.linkedStrengthId = "a1";
    expect(validateSwot(m)).toHaveLength(0);
  });

  it("avisa quando a ameaça parece interna", () => {
    const m = matricesVazias();
    m.swot.forcas = [{ id: "a1", text: "Equipe pequena e muito dedicada" }];
    m.swot.ameacas = [{ id: "t1", text: "Equipe pequena" }];
    const issues = validateSwot(m);
    expect(issues.some((i) => /interna/.test(i.text))).toBe(true);
  });
});
