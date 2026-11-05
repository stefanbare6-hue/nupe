/**
 * Dados de demonstração — TODOS FICTÍCIOS.
 * Marcados com demo=true nas coletas e no rótulo "(fictício)" das respostas.
 * A demonstração robusta traz 30 respostas por público e todas as fichas
 * preenchidas; o "Remover dados fictícios" tira tudo de uma vez.
 */
import { randomBytes } from "node:crypto";
import { AUDIENCES, SURVEYS, SUGGESTED_THEMES, suggestThemeIds, type Audience, type Collection, type Matrices } from "@nupe/core";
import type { Store } from "./db";

/** Quantidade de respostas fictícias por público. */
const RESPOSTAS_POR_PUBLICO = 30;
const FICTICIO = " (fictício)";

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
    "Um canal de WhatsApp com avisos curtos ajudaria a não perder prazos.",
    "Os prazos chegam em cima da hora; avisar com antecedência resolve.",
    "O SISPROEX é confuso para anexar documentos; um tutorial curto ajudaria.",
    "Preciso de apoio para registrar a prestação de contas.",
    "Centralizar editais em um único mural digital.",
    "Ter alguém do NUPE para acompanhar o projeto de perto.",
    "O canal seria útil, principalmente perto do fim do semestre.",
    "Um calendário com as datas de abertura de cada edital.",
    "O modelo de relatório deveria vir pronto, sem começar de zero.",
    "Avisos curtos no colegiado de curso funcionariam bem aqui.",
    "Saber antes quem aprova o relatório dentro da PROEX.",
    "Uma página com o passo a passo de cada etapa do registro.",
  ],
  estudantes: [
    "Divulgar nas salas e nos grupos dos colegas de cada curso.",
    "Criar um canal no WhatsApp e postar editais abertos.",
    "Só fico sabendo por professor; um mural atualizado ajudaria.",
    "Explicar como começar e quais documentos precisam.",
    "Avisarem com antecedência, muitos editais fecham rápido.",
    "Ter um encontro de apresentação do NUPE no começo do semestre.",
    "Melhorar o site, que é difícil de navegar.",
    "O canal de WhatsApp é a melhor opção para mim.",
    "Cartazes nos corredores perto da cantina.",
    "Mostrar exemplos de projetos que estudantes já fizeram.",
    "Divulgar no Instagram do campus também.",
    "Um horário fixo de atendimento para tirar dúvidas.",
  ],
  equipe: [
    "Um calendário único de prazos reduziria avisos repetidos.",
    "Aviso automático de prazos aos proponentes evitaria relatórios atrasados.",
    "O registro no SISPROEX gera retrabalho quando falta documento.",
    "Canal de WhatsApp economizaria tempo de divulgação.",
    "Mais suporte de TI para dúvidas do sistema.",
    "Modelos de documentos prontos ajudariam os estudantes.",
    "Uma planilha única de acompanhamento, com checklist por etapa.",
    "Dividir quem acompanha cada projeto entre a equipe.",
    "Reunião mensal curta para ver o que travou.",
    "Um manual curto do SISPROEX para os bolsistas novos.",
    "Revisar o fluxo de pagamento, que concentra os atrasos.",
    "Um registro próprio das dúvidas mais frequentes.",
  ],
};

const HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20];

export async function seedDemo(store: Store): Promise<void> {
  await limparDemo(store);

  const rnd = mulberry32(20261104);
  const start = new Date();
  start.setDate(start.getDate() - 14);
  start.setHours(8, 0, 0, 0);
  const closes = new Date();
  closes.setDate(closes.getDate() + 7);
  closes.setHours(23, 59, 0, 0);

  /** Pesos por pergunta. Escalas trazem a distribuição das cinco notas. */
  const plans: Record<Audience, Record<string, number[] | "scale">> = {
    docentes: {
      d1: [0.34, 0.22, 0.3, 0.14],
      d2: [0.5, 0.55, 0.45, 0.25, 0.18],
      d3: [0.18, 0.24, 0.3, 0.18, 0.1],
      d4: [0.28, 0.4, 0.22, 0.1],
      d5: [0.22, 0.5, 0.28],
      d6: [0.06, 0.14, 0.28, 0.34, 0.18],
      d7: [0.58, 0.26, 0.16],
    },
    estudantes: {
      e1: [0.36, 0.28, 0.36],
      e2: [0.2, 0.18, 0.15, 0.62],
      e3: [0.2, 0.45, 0.35],
      e4: [0.18, 0.62, 0.42, 0.5, 0.24, 0.34],
      e5: [0.5, 0.42, 0.24, 0.55, 0.36],
      e6: [0.2, 0.26, 0.32, 0.16, 0.06],
      e7: [0.62, 0.26, 0.12],
    },
    equipe: {
      q1: [0.5, 0.45, 0.6, 0.55, 0.3, 0.2, 0.1],
      q2: [0.12, 0.3, 0.22, 0.3, 0.06],
      q3: [0.2, 0.28, 0.3, 0.16, 0.06],
      q4: [0.2, 0.44, 0.36],
      q5: [0.36, 0.18, 0.26, 0.16, 0.04],
      q6: [0.3, 0.55, 0.4, 0.6, 0.5, 0.1],
      q7: [0.16, 0.24, 0.34, 0.2, 0.06],
    },
  };

  for (const audience of AUDIENCES) {
    const plan = plans[audience];
    const c: Collection = {
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
    };
    store.data.collections.push(c);
    const survey = SURVEYS[audience];
    const pool = OPEN_TEXTS[audience];
    const temas = store.data.themes.length ? store.data.themes : SUGGESTED_THEMES;

    for (let i = 0; i < RESPOSTAS_POR_PUBLICO; i++) {
      const answers = survey.questions.map((q) => {
        const w = plan[q.id];
        if (q.type === "scale") {
          const dist = w && w !== "scale" ? w : [0.1, 0.2, 0.4, 0.2, 0.1];
          return { questionId: q.id, value: pick([1, 2, 3, 4, 5], dist, rnd) };
        }
        if (q.type === "open") {
          // Uma em cada cinco respostas deixa a aberta em branco.
          if (i % 5 === 4) return { questionId: q.id, value: null };
          return { questionId: q.id, value: `${pool[Math.floor(rnd() * pool.length)]}${FICTICIO}` };
        }
        const opts = q.options ?? [];
        if (q.type === "multi") {
          const chosen = opts.filter((_, idx) => rnd() < (w?.[idx] ?? 0)).map((o) => o.code);
          return { questionId: q.id, value: chosen.length ? chosen : [opts[opts.length - 1]!.code] };
        }
        return { questionId: q.id, value: pick(opts, w ?? [1], rnd).code };
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
          themeIds: suggestThemeIds(a.value, temas),
          manualThemeId: null,
          createdAt: submitted.toISOString(),
        });
      }
    }
  }

  fichasDemonstrativas(store);

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

  store.data.demo = `Demonstração fictícia ativa — ${RESPOSTAS_POR_PUBLICO} respostas por público`;
  store.note("dados fictícios de demonstração carregados", `${RESPOSTAS_POR_PUBLICO} por público`);
  await store.save();
}

/** Fichas 1 a 8 e matrizes, no mesmo formato que a tela grava. */
function fichasDemonstrativas(store: Store): void {
  const d = store.data;
  const stamp = new Date().toISOString();
  const id = () => randomBytes(6).toString("hex");

  d.institution = {
    fields: {
      missao: `Articular pesquisa e extensão no DCHT XXI, aproximando a universidade das escolas e dos empreendimentos de Ipiaú${FICTICIO}`,
      visao: `Ser a porta de entrada do campus para projetos de extensão, com informação clara a docentes e estudantes${FICTICIO}`,
      valores: `Autonomia da comunidade, diálogo com a escola pública e transparência na prestação de contas${FICTICIO}`,
      coordenacao: "Coordenação do NUPE, com apoio da Direção do DCHT XXI e da PROEX",
      estrutura:
        "Coordenação, professores colaboradores por curso (Administração, Letras e Engenharia Agroindustrial) e bolsistas de monitoria de extensão.",
      lideranca: "Participativo: as decisões dos editais são discutidas com os colaboradores antes de irem ao colegiado.",
    },
    numbers: [
      { id: id(), indicator: "Projetos de extensão ativos", value: "6", source: "Relatório de gestão 2025 do campus" },
      { id: id(), indicator: "Projetos de pesquisa ativos", value: "9", source: "Relatório de gestão 2025 do campus" },
      { id: id(), indicator: "Bolsistas", value: "12", source: "SISPROEX, outubro de 2026" },
      { id: id(), indicator: "Editais por ano", value: "3", source: "PROEX, edital 02/2026" },
      { id: id(), indicator: "Públicos atendidos", value: "410", source: "Relatórios anuais dos 6 projetos de extensão, 2025" },
    ],
    updatedAt: stamp,
  };

  d.flows = [
    {
      id: id(),
      name: "Pagamento da bolsa de monitoria de extensão",
      process: "Do edital ao pagamento mensal da bolsa de monitoria",
      steps: [
        ["Divulgação do edital", "Coordenação do NUPE", "Site da PROEX", "Fevereiro", "O aviso chega tarde ao noturno"],
        ["Inscrição e seleção", "Professores colaboradores", "Formulário online", "Março", "Poucos candidatos com disponibilidade no contraturno"],
        ["Comunicação do resultado", "Coordenação do NUPE", "E-mail institucional", "Março", "Estudantes não checam o e-mail institucional"],
        ["Registro no SISPROEX", "Bolsistas", "SISPROEX", "Mensal", "Sistema fora do ar nos dias de fechamento"],
        ["Pagamento da bolsa", "Pró-reitoria de Gestão de Pessoas", "SISPROEX e folha", "Mensal", "Atraso quando o relatório não é aprovado"],
      ].map(([stage, who, docSystem, deadline, blocker]) => ({
        id: id(),
        stage: stage!,
        who: who!,
        docSystem: docSystem!,
        deadline: deadline!,
        blocker: blocker!,
      })),
    },
  ];

  d.systems = [
    {
      id: id(),
      name: "SISPROEX",
      fields: {
        nomeFinalidade: "Registro dos projetos de extensão do campus, do plano de trabalho ao relatório final.",
        quemUsa: "Coordenação do NUPE, professores colaboradores e bolsistas",
        oQueEntra: "Dados do projeto, plano de trabalho, relatórios parciais e comprovantes.",
        oQueSai: "Relatórios de extensão e histórico do projeto para a PROEX.",
        errosComuns: "Esquecem de anexar o comprovante e o sistema recusa o envio perto do prazo.",
        suporte: "PROEX — Coordenação de Extensão",
      },
    },
    {
      id: id(),
      name: "Sistema de iniciação científica [confirmar o nome]",
      fields: {
        nomeFinalidade: "Acompanhamento dos bolsistas de iniciação científica do campus.",
        quemUsa: "Professores orientadores e bolsistas de IC",
        oQueEntra: "Plano de trabalho, relatórios semestrais e certificados.",
        oQueSai: "Pareceres e certificados de participação.",
        errosComuns: "O nome exato do sistema ainda não foi confirmado; a dúvida está no diário de campo.",
        suporte: "Pró-Reitoria de Pós-Graduação e Pesquisa",
      },
    },
  ];

  d.procedures = [
    { id: "selecao", procedure: "Seleção de projetos e bolsistas", base: "Edital 02/2026 da PROEX", responsible: "Coordenação do NUPE", deadline: "Aberto até março" },
    { id: "registro", procedure: "Registro e acompanhamento de projetos", base: "Resolução 1.234/2024 da UNEB", responsible: "Bolsista responsável", deadline: "Mensal" },
    { id: "pagamento", procedure: "Pagamento de bolsas", base: "Resolução 1.234/2024 e manual de gestão de pessoas", responsible: "Pró-reitoria de Gestão e Desenvolvimento de Pessoas", deadline: "Mensal" },
    { id: "relatorios", procedure: "Relatórios de projetos", base: "Edital 02/2026 da PROEX", responsible: "Colegiado do DCHT XXI", deadline: "Até 60 dias após o encerramento" },
    { id: "estagio", procedure: "Estágio supervisionado", base: "Lei do Estágio (Lei 11.788/2008)", responsible: "Professor orientador do estágio", deadline: "Ao fim de cada semestre" },
    { id: "trabalhista", procedure: "Direito trabalhista e previdenciário", base: "Combinar com o professor o recorte esperado", responsible: "Coordenação do colegiado do curso", deadline: "Conforme o calendário da componente" },
  ];

  d.improvement = {
    id: "principal",
    idea: `Canal único de avisos do NUPE no WhatsApp, com calendário de prazos e roteiro de registro no SISPROEX${FICTICIO}`,
    fiveW2H: {
      oQue: "Canal no WhatsApp com editais, prazos e o passo a passo do registro.",
      porQue: "Os questionários mostram falta de aviso entre a equipe e divulgação concentrada em grupos de mensagens.",
      quem: "Estagiário, com apoio da coordenação do NUPE.",
      onde: "WhatsApp e murais do DCHT XXI.",
      quando: "Aberto em fevereiro, antes do próximo edital, com um aviso por quinzena.",
      como: "Resumir cada edital em até cinco linhas e publicar o calendário do semestre.",
      quanto: "Sem custo adicional; usa o número já existente do núcleo.",
    },
    pdca: {
      planejar: "Montar o calendário do semestre e o roteiro de registro em uma página.",
      fazer: "Abrir o canal e convidar docentes e estudantes pelas coordenações de curso.",
      checar: "Comparar, em 30 dias, quantas dúvidas chegam por fora do canal e quantos relatórios chegam no prazo.",
      ajustar: "Mudar a frequência e o formato dos avisos conforme as dúvidas que aparecerem.",
    },
    updatedAt: stamp,
  };

  d.diary = [
    ["2026-09-02", "Conversa com a coordenação: os editais de extensão saem em fevereiro, mas o aviso chega ao noturno só em março.", "Conversa com a coordenação do NUPE", "O aviso pode ser enviado direto pelas coordenações de curso?"],
    ["2026-09-09", "Consulta ao relatório de gestão 2025: 6 projetos de extensão e 9 de pesquisa ativos no campus.", "Relatório de gestão 2025 do campus", "De onde vem o número de públicos atendidos?"],
    ["2026-09-16", "No SISPROEX, o sistema recusa o envio do relatório quando falta o comprovante anexado.", "Tela do SISPROEX", "Esse bloqueio está em algum manual?"],
    ["2026-09-23", "Três estudantes relataram que só souberam do edital por grupo de mensagens.", "Conversa no corredor do DCHT XXI", "Quantos estudantes ficam de fora por não estarem em grupo nenhum?"],
    ["2026-10-01", "Reunião com professores colaboradores: pedem aviso com antecedência, não mais documentos.", "Reunião com os colaboradores", "Qual antecedência é viável para a PROEX?"],
    ["2026-10-08", "Conferência no painel: as perguntas de escala passam a mostrar média a partir de 5 respostas.", "Painel de resultados do sistema", "As médias entram no relatório como dado descritivo?"],
    ["2026-10-15", "O nome do sistema de iniciação científica não aparece em nenhum documento do campus.", "Conversa com a Pró-reitoria de Pós-Graduação", "Quem no campus confirma o nome oficial?"],
    ["2026-10-22", "Os bolsistas usam planilhas paralelas ao SISPROEX para acompanhar os prazos.", "Observação com os bolsistas", "Essas planilhas podem virar um anexo do relatório?"],
  ].map(([date, observation, source, question]) => ({
    id: id(),
    date: date!,
    observation: observation!,
    source: source!,
    question: question!,
  }));

  d.glossary = [
    ["NUPE", "Núcleo de Pesquisa e Extensão", "Slides do estágio"],
    ["DCHT XXI", "Departamento de Ciências Humanas e Tecnologias do Campus XXI", "Site do campus"],
    ["SISPROEX", "Sistema de registro de projetos de extensão da UNEB", "Tela do SISPROEX"],
    ["PROEX", "Pró-Reitoria de Extensão da UNEB", "Edital 02/2026"],
    ["GUT", "Matriz de priorização por gravidade, urgência e tendência", "Guia de matrizes do estágio"],
    ["5W2H", "Plano de ação com sete perguntas: o quê, por quê, quem, onde, quando, como e quanto", "Guia de matrizes do estágio"],
    ["PDCA", "Ciclo de planejar, fazer, checar e ajustar", "Guia de matrizes do estágio"],
    ["Campus XXI", "Campus de Ipiaú da UNEB", "Site do campus"],
  ].map(([acronym, meaning, source]) => ({ id: id(), acronym: acronym!, meaning: meaning!, source: source! }));

  const forcaId = id();
  const matrizes: Matrices = {
    porter: {
      clientes: [
        { id: id(), text: "Docentes do Campus XXI", evidence: "Ficha 1" },
        { id: id(), text: "Estudantes de graduação do campus", evidence: "Respostas dos estudantes" },
        { id: id(), text: "Escolas públicas de Ipiaú", evidence: "Diário de campo, registro 2" },
      ],
      fornecedores: [
        { id: id(), text: "Pró-reitoria de Extensão (PROEX)", evidence: "Ficha 5" },
        { id: id(), text: "Direção do DCHT XXI", evidence: "Ficha 1" },
        { id: id(), text: "SISPROEX", evidence: "Ficha 4" },
      ],
      concorrentes: [{ id: id(), text: "Outros núcleos do campus", evidence: "Conversa com a coordenação" }],
      novosEntrantes: [{ id: id(), text: "Ligas acadêmicas", evidence: "Observação no campus" }],
      substitutos: [{ id: id(), text: "Grupos de pesquisa que buscam editais por conta própria", evidence: "Conversa com docentes" }],
    },
    swot: {
      forcas: [
        { id: forcaId, text: "Equipe próxima dos estudantes", evidence: "Ficha 1" },
        { id: id(), text: "Boa relação com as escolas do município", evidence: "Diário de campo, registro 2" },
      ],
      fraquezas: [
        { id: id(), text: "Registro disperso em planilhas", evidence: "Ficha 4" },
        { id: id(), text: "Pouca divulgação das ações", evidence: "Questionário Estudantes Q4" },
      ],
      oportunidades: [
        { id: id(), text: "Editais de extensão abertos", evidence: "Edital 02/2026", linkedStrengthId: forcaId },
        { id: id(), text: "Parcerias com a rede pública de Ipiaú", evidence: "Diário de campo, registro 2" },
      ],
      ameacas: [{ id: id(), text: "Poucos bolsistas com disponibilidade no contraturno", evidence: "Questionário Equipe Q1" }],
    },
    gut: [
      { id: id(), text: "Aviso de edital chega tarde ao noturno", evidence: "Diário de campo, registro 1", gravity: 4, urgency: 5, tendency: 3 },
      { id: id(), text: "Falta de comprovante anexado no SISPROEX", evidence: "Ficha 4", gravity: 3, urgency: 4, tendency: 2 },
      { id: id(), text: "Prazos de relatório sem aviso prévio", evidence: "Questionário Docentes Q5", gravity: 4, urgency: 4, tendency: 3 },
      { id: id(), text: "Divulgação concentrada em grupos de mensagens", evidence: "Questionário Estudantes Q4", gravity: 3, urgency: 3, tendency: 4 },
    ],
    notes: {},
  };
  d.matrices = matrizes;
}

/** Tira só o que a demonstração criou; o que é real fica onde está. */
export async function limparDemo(store: Store): Promise<void> {
  const d = store.data;
  const ids = new Set(d.collections.filter((c) => c.demo).map((c) => c.id));
  if (!ids.size && d.demo === null) return;
  d.entries = d.entries.filter((e) => !ids.has(e.collectionId));
  d.openResponses = d.openResponses.filter((r) => !ids.has(r.collectionId));
  d.collections = d.collections.filter((c) => !c.demo);
  for (const id of ids) delete d.contest[id];
  d.visits = [];
  d.demo = null;
  store.note("dados fictícios removidos");
  await store.save();
}
