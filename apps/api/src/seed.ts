/**
 * Dados de demonstração — TODOS FICTÍCIOS.
 * Marcados com demo=true nas coletas e no rótulo "[fictício]" das respostas.
 * As fichas de campo NÃO recebem dados fictícios: ficam vazias para o
 * estagiário preencher com informação real.
 */
import { randomBytes } from "node:crypto";
import { AUDIENCES, SURVEYS, suggestThemeIds, type Audience, type Collection } from "@nupe/core";
import type { Store } from "./db";

function pick<T>(arr: T[], weights: number[], rnd: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return arr[i]!;
  }
  return arr[arr.length - 1]!;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPEN_TEXTS: Record<Audience, string[]> = {
  docentes: [
    "Um canal de WhatsApp com avisos curtos ajudaria a não perder prazos. (fictício)",
    "Os prazos chegam em cima da hora; avisar com antecedência resolve. (fictício)",
    "O SISPROEX é confuso para anexar documentos; um tutorial curto ajudaria. (fictício)",
    "Preciso de apoio para registrar a prestação de contas. (fictício)",
    "Centralizar editais em um único mural digital. (fictício)",
    "Ter alguém do NUPE para acompanhar o projeto de perto. (fictício)",
    "O canal seria útil, principalmente perto do fim do semestre. (fictício)",
  ],
  estudantes: [
    "Divulgar nas salas e nos grupos dos colegas de cada curso. (fictício)",
    "Criar um canal no WhatsApp e postar editais abertos. (fictício)",
    "Só fico sabendo por professor; um mural atualizado ajudaria. (fictício)",
    "Explicar como começar e quais documentos precisam. (fictício)",
    "Avisarem com antecedência, muitos editais fecham rápido. (fictício)",
    "Ter um encontro de apresentação do NUPE no começo do semestre. (fictício)",
    "Melhorar o site, que é difícil de navegar. (fictício)",
    "O canal de WhatsApp é a melhor opção para mim. (fictício)",
  ],
  equipe: [
    "Um calendário único de prazos reduziria avisos repetidos. (fictício)",
    "Aviso automático de prazos aos proponentes evitaria relatórios atrasados. (fictício)",
    "O registro no SISPROEX gera retrabalho quando falta documento. (fictício)",
    "Canal de WhatsApp economizaria tempo de divulgação. (fictício)",
    "Mais suporte de TI para dúvidas do sistema. (fictício)",
    "Modelos de documentos prontos ajudariam os estudantes. (fictício)",
  ],
};

const HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20];

export async function seedDemo(store: Store): Promise<void> {
  const rnd = mulberry32(20261104);
  const start = new Date();
  start.setDate(start.getDate() - 14);
  start.setHours(8, 0, 0, 0);
  const closes = new Date();
  closes.setDate(closes.getDate() + 7);
  closes.setHours(23, 59, 0, 0);

  const plans: Record<Audience, { n: number; weights: Record<string, number[] | "scale"> }> = {
    docentes: {
      n: 6,
      weights: {
        d1: [0.45, 0.15, 0.2, 0.2],
        d2: [0.2, 0.35, 0.2, 0.15, 0.1],
        d3: "scale",
        d4: [0.3, 0.4, 0.2, 0.1],
        d5: [0.15, 0.5, 0.35],
        d6: "scale",
        d7: [0.6, 0.3, 0.1],
      },
    },
    estudantes: {
      n: 34,
      weights: {
        e1: [0.4, 0.3, 0.3],
        e2: [0.2, 0.15, 0.2, 0.55],
        e3: [0.15, 0.4, 0.45],
        e4: [0.1, 0.35, 0.3, 0.25, 0.2, 0.35],
        e5: [0.5, 0.3, 0.2, 0.35, 0.4],
        e6: "scale",
        e7: [0.7, 0.25, 0.05],
      },
    },
    equipe: {
      n: 4,
      weights: {
        q1: [0.4, 0.3, 0.5, 0.5, 0.3, 0.3, 0.1],
        q2: [0.1, 0.4, 0.3, 0.2, 0.0],
        q3: "scale",
        q4: [0.2, 0.5, 0.3],
        q5: [0.35, 0.15, 0.25, 0.2, 0.05],
        q6: [0.3, 0.7, 0.4, 0.3, 0.3, 0.1],
        q7: "scale",
      },
    },
  };

  const scaleWeights: Record<string, number[]> = {
    d3: [0.25, 0.3, 0.25, 0.15, 0.05],
    d6: [0.05, 0.1, 0.25, 0.35, 0.25],
    e6: [0.25, 0.3, 0.25, 0.15, 0.05],
    q3: [0.3, 0.3, 0.25, 0.15, 0.0],
    q7: [0.15, 0.25, 0.3, 0.2, 0.1],
  };

  for (const audience of AUDIENCES) {
    const plan = plans[audience];
    let c = store.data.collections.find((x) => x.audience === audience && x.demo);
    if (!c) {
      c = {
        id: crypto.randomUUID(),
        publicId: randomBytes(16).toString("base64url"),
        audience,
        status: "aberta",
        label: "2ª coleta — demonstrativo (fictício)",
        opensAt: start.toISOString(),
        closesAt: closes.toISOString(),
        createdAt: new Date().toISOString(),
        demo: true,
        responses: 0,
      } satisfies Collection;
      store.data.collections.push(c);
    }
    const survey = SURVEYS[audience];
    for (let i = 0; i < plan.n; i++) {
      const answers = survey.questions.map((q) => {
        const w = plan.weights[q.id];
        if (!w || w === "scale" || q.type === "scale" || q.type === "open") {
          if (q.type === "scale") {
            const dist = scaleWeights[q.id] ?? [0.1, 0.2, 0.4, 0.2, 0.1];
            const value = pick([1, 2, 3, 4, 5], dist, rnd);
            return { questionId: q.id, value };
          }
          if (q.type === "open") {
            if (rnd() > 0.55) {
              const pool = OPEN_TEXTS[audience];
              return { questionId: q.id, value: pool[Math.floor(rnd() * pool.length)]! };
            }
            return { questionId: q.id, value: null };
          }
          return { questionId: q.id, value: null };
        }
        const opts = q.options ?? [];
        if (q.type === "multi") {
          const chosen = opts.filter((_, idx) => rnd() < (w[idx] ?? 0)).map((o) => o.code);
          return { questionId: q.id, value: chosen.length ? chosen : [opts[opts.length - 1]!.code] };
        }
        return { questionId: q.id, value: pick(opts, w, rnd).code };
      });
      const day = Math.floor(rnd() * 12);
      const submitted = new Date(start);
      submitted.setDate(start.getDate() + day);
      submitted.setHours(HOURS[Math.floor(rnd() * HOURS.length)]!, Math.floor(rnd() * 60), 0, 0);
      const entryId = crypto.randomUUID();
      store.data.entries.push({
        id: entryId,
        collectionId: c.id,
        submittedAt: submitted.toISOString(),
        answers,
      });
      for (const a of answers) {
        if (typeof a.value !== "string") continue;
        const q = survey.questions.find((x) => x.id === a.questionId);
        if (q?.type !== "open") continue;
        store.data.openResponses.push({
          id: crypto.randomUUID(),
          entryId,
          collectionId: c.id,
          audience,
          questionId: q.id,
          text: a.value,
          themeIds: suggestThemeIds(a.value, store.data.themes),
          manualThemeId: null,
          createdAt: submitted.toISOString(),
        });
      }
    }
  }

  // Visitas fictícias (apenas contadores agregados)
  store.data.visits = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    store.data.visits.push({ date: d.toISOString().slice(0, 10), count: Math.floor(6 + rnd() * 18) });
  }

  store.data.settings = {
    ...store.data.settings,
    displayName: store.data.settings.displayName || "NUPE — UNEB Campus XXI",
    startDate: start.toISOString().slice(0, 10),
    endDate: closes.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };

  store.data.demo = "Demonstração fictícia ativa";
  store.note("dados fictícios de demonstração carregados");
  await store.save();
}
