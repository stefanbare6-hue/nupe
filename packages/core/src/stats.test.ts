import { describe, expect, it } from "vitest";
import { analyzeAudience, analyzeQuestion, median, MIN_SAMPLE_FOR_PERCENT, normalizeScale, pct, scrubOpenText, validateSubmission } from "./stats";
import { DOCENTES, ESTUDANTES, EQUIPE } from "./surveys";

const q = (n: number) => ESTUDANTES.questions.find((x) => x.number === n)!;

describe("amostra mínima", () => {
  it("só libera percentual a partir de 5 respostas", () => {
    expect(MIN_SAMPLE_FOR_PERCENT).toBe(5);
    expect(pct(3, 5)).toBe(60);
    expect(pct(1, 4)).toBeNull();
    expect(pct(0, 0)).toBeNull();
  });

  it("arredonda para uma casa decimal", () => {
    expect(pct(1, 6)).toBe(16.7);
    expect(pct(2, 3)).toBeNull();
    expect(pct(2, 6)).toBe(33.3);
  });
});

describe("amostra mínima por pergunta", () => {
  it("público com 5 respostas e pergunta respondida por 3 não mostra percentual", () => {
    // 5 respostas no público, mas a pergunta 6 (escala) recebeu só 3.
    const entradas = [
      { answers: { e6: 1 } },
      { answers: { e6: 2 } },
      { answers: { e6: 3 } },
      { answers: {} },
      { answers: {} },
    ];
    const r = analyzeAudience(ESTUDANTES, entradas);
    expect(r.total).toBe(5);
    expect(r.showPercent).toBe(true);
    const p6 = r.questions.find((x) => x.number === 6)!;
    expect(p6.answered).toBe(3);
    expect(p6.showPercent).toBe(false);
    expect(p6.scale!.distribution.every((d) => d.percent === null)).toBe(true);
    const p1 = r.questions.find((x) => x.number === 1)!;
    expect(p1.showPercent).toBe(false);
  });
});

describe("múltipla escolha", () => {
  it("conta cada respondente uma vez por opção", () => {
    const respostas = [
      { e2: ["extensao", "pesquisa", "extensao"] },
      { e2: ["extensao"] },
      { e2: [] },
      { e2: "monitoria" },
      { e2: "inexistente" },
      { e2: ["pesquisa"] },
    ];
    const r = analyzeQuestion(q(2), respostas, 4);
    expect(r.answered).toBe(4);
    const porCodigo = Object.fromEntries(r.options.map((o) => [o.code, o.count]));
    expect(porCodigo.extensao).toBe(2);
    expect(porCodigo.pesquisa).toBe(2);
    expect(porCodigo.monitoria).toBe(1);
    expect(porCodigo.nenhum).toBe(0);
    // 4 respondentes: ainda é amostra pequena.
    expect(r.showPercent).toBe(false);
    expect(r.options.every((o) => o.percent === null)).toBe(true);
  });

  it("calcula percentual com amostra de 5 ou mais", () => {
    const respostas = [
      { e2: ["extensao"] },
      { e2: ["extensao"] },
      { e2: ["pesquisa"] },
      { e2: ["pesquisa"] },
      { e2: ["monitoria"] },
      { e2: ["nenhum"] },
    ];
    const r = analyzeQuestion(q(2), respostas, respostas.length);
    expect(r.answered).toBe(6);
    expect(r.showPercent).toBe(true);
    expect(r.options.find((o) => o.code === "extensao")!.percent).toBe(33.3);
  });

  it("mostra contagem sem percentual quando a amostra é pequena", () => {
    const r = analyzeQuestion(q(1), [{ e1: "letras" }, { e1: "letras" }], 2);
    expect(r.showPercent).toBe(false);
    expect(r.options.find((o) => o.code === "letras")!.count).toBe(2);
    expect(r.options.every((o) => o.percent === null)).toBe(true);
  });
});

describe("escala", () => {
  it("calcula média, mediana e distribuição só sobre respostas válidas", () => {
    const r = analyzeQuestion(q(6), [{ e6: 1 }, { e6: 2 }, { e6: 4 }, { e6: 5 }, { e6: "3" }, { e6: 9 }, { e6: null }], 7);
    expect(r.answered).toBe(5);
    expect(r.scale!.mean).toBe(3);
    expect(r.scale!.median).toBe(3);
    expect(r.scale!.distribution.map((d) => d.count)).toEqual([1, 1, 1, 1, 1]);
    expect(r.scale!.distribution[0]!.percent).toBe(20);
  });

  it("sem respostas, média e mediana ficam vazias", () => {
    const r = analyzeQuestion(q(6), [], 0);
    expect(r.scale!.mean).toBeNull();
    expect(r.scale!.median).toBeNull();
    expect(r.answered).toBe(0);
  });

  it("mediana de lista par é a média dos dois do meio", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("aceita só inteiros de 1 a 5", () => {
    expect(normalizeScale(3)).toBe(3);
    expect(normalizeScale("5")).toBe(5);
    expect(normalizeScale(0)).toBeNull();
    expect(normalizeScale(2.5)).toBeNull();
    expect(normalizeScale("cinco")).toBeNull();
  });
});

describe("respostas abertas", () => {
  it("guarda o texto corrido das respostas preenchidas", () => {
    const r = analyzeQuestion(q(8), [{ e8: "  Criar canal  " }, { e8: "   " }, { e8: "" }], 3);
    expect(r.openTexts).toEqual(["  Criar canal  "]);
    expect(r.answered).toBe(1);
  });

  it("limpa espaços repetidos e trunca no teto", () => {
    expect(scrubOpenText("  a   b \n c ")).toBe("a b c");
    expect(scrubOpenText("x".repeat(1300)).length).toBe(1200);
  });
});

describe("validação do envio", () => {
  const valido = {
    e1: "letras",
    e2: ["extensao"],
    e3: "sim",
    e4: ["site"],
    e5: ["prazos"],
    e6: 4,
    e7: "talvez",
  };

  it("aceita questionário completo", () => {
    expect(validateSubmission(ESTUDANTES, valido)).toEqual([]);
  });

  it("aponta cada pergunta obrigatória vazia", () => {
    const erros = validateSubmission(ESTUDANTES, {});
    expect(erros.length).toBe(7);
    expect(erros[0]).toMatch(/pergunta 1/);
  });

  it("recusa código de opção inexistente", () => {
    expect(validateSubmission(ESTUDANTES, { ...valido, e1: "medicina" })).toHaveLength(1);
    expect(validateSubmission(ESTUDANTES, { ...valido, e2: ["cursinho"] })).toHaveLength(1);
    expect(validateSubmission(ESTUDANTES, { ...valido, e6: 7 })).toHaveLength(1);
  });

  it("permite pular a aberta opcional e limita o tamanho", () => {
    expect(validateSubmission(ESTUDANTES, { ...valido, e8: "" })).toEqual([]);
    expect(validateSubmission(ESTUDANTES, { ...valido, e8: "a".repeat(1300) })).toHaveLength(1);
  });

  it("aceita pular a pergunta opcional da equipe", () => {
    const base = { q1: ["documentos"], q3: 2, q4: "as_vezes", q5: "outra", q6: ["site"], q7: 3 };
    expect(validateSubmission(EQUIPE, base)).toEqual([]);
  });
});

describe("resumo por público", () => {
  it("gera uma linha por pergunta do questionário", () => {
    const r = analyzeAudience(DOCENTES, [{ answers: { d1: "ambos", d2: ["nupe"], d3: 5, d4: "relatorio", d5: "sempre", d6: 4, d7: "sim" } }]);
    expect(r.questions).toHaveLength(8);
    expect(r.total).toBe(1);
    expect(r.showPercent).toBe(false);
    expect(r.questions.every((x) => x.questionId && x.number >= 1 && x.number <= 8)).toBe(true);
  });
});
