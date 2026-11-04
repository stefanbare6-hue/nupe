import { describe, expect, it } from "vitest";
import { gutPriority, gutScore, sortByGut } from "./flows";
import { suggestThemeIds, extractKeywords, UNCLASSIFIED_THEME_ID, SUGGESTED_THEMES } from "./themes";
import { isPlaceholder, PLACEHOLDER } from "./forms";

describe("matriz GUT", () => {
  it("multiplica 1 a 5 e classifica a prioridade", () => {
    expect(gutScore({ gravity: 5, urgency: 4, tendency: 3 })).toBe(60);
    expect(gutPriority(60)).toBe("Alta");
    expect(gutPriority(59)).toBe("Média");
    expect(gutPriority(30)).toBe("Média");
    expect(gutPriority(29)).toBe("Baixa");
  });

  it("limita notas fora da faixa", () => {
    expect(gutScore({ gravity: 9, urgency: 0, tendency: 5 })).toBe(25);
    expect(gutScore({ gravity: Number.NaN, urgency: 2, tendency: 2 })).toBe(4);
  });

  it("ordena do maior para o menor", () => {
    const r = sortByGut([{ gut: 10 }, { gut: 80 }, { gut: 45 }]);
    expect(r.map((x) => x.gut)).toEqual([80, 45, 10]);
  });
});

describe("sugestão de tema", () => {
  it("acha o tema pelas palavras-chave, sem acento", () => {
    expect(suggestThemeIds("Criar um canal no WhatsApp")).toContain("comunicacao");
    expect(suggestThemeIds("O prazo é curto e o calendário muda")).toContain("prazos");
    expect(suggestThemeIds("O SISPROEX dá erro de login")).toContain("sistema");
  });

  it("devolve chaves estáveis da lista de temas", () => {
    const ids = new Set(SUGGESTED_THEMES.map((t) => t.id));
    for (const texto of ["divulgar no mural", "falta de computador e internet", "bolsa e transporte", "documento e assinatura"]) {
      for (const id of suggestThemeIds(texto)) expect(ids.has(id)).toBe(true);
    }
  });

  it("texto sem palavra-chave fica sem tema", () => {
    const r = suggestThemeIds("zzz");
    expect(r).toEqual([]);
    expect(UNCLASSIFIED_THEME_ID).toBe("sem-tema");
  });

  it("extrai palavras úteis e descarta palavras vazias", () => {
    const k = extractKeywords("Eu gostaria que o NUPE avisasse com antecedência");
    expect(k).toContain("nupe");
    expect(k).toContain("antecedencia");
    expect(k).not.toContain("que");
    expect(k.every((w) => w.length >= 4)).toBe(true);
  });
});

describe("célula vazia", () => {
  it("reconhece vazio, nulo, espaço e o marcador de preenchimento", () => {
    expect(PLACEHOLDER).toBe("[preencher]");
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("   ")).toBe(true);
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(PLACEHOLDER)).toBe(true);
    expect(isPlaceholder(" [ preencher ] ")).toBe(true);
    expect(isPlaceholder("Texto completo [preencher]")).toBe(true);
    expect(isPlaceholder("Missão definida")).toBe(false);
  });
});
