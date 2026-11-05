import type { FastifyInstance } from "fastify";
import {
  AUDIENCES,
  FLOW_TEMPLATES,
  SURVEYS,
  type Flow,
  analyzeAudience,
  buildMissing,
  buildNextSteps,
  buildReport,
  computeGut,
  chavesDoLote,
  effectiveThemeIds,
  getSurvey,
  isAudience,
  renderReportDocument,
  type Audience,
  type Matrices,
  type RawAnswers,
  type ReportInput,
} from "@nupe/core";
import { randomBytes } from "node:crypto";
import type { DB, Store } from "./db";
import { createSession, destroySession, hashPassword, isAuthenticated, rateLimiter, verifyPassword } from "./auth";
import { issueAntibotToken, collectionByPublicId, answeredBy } from "./routes-public";
import { limparDemo, seedDemo } from "./seed";
import { anterior, conteudoDe, itensDe, registrarMudancas, restaurar } from "./historico";

const secureCookie = process.env.NODE_ENV === "production" || process.env.NUPE_SECURE_COOKIE === "1";

const isHttps = (req: { protocol?: string; headers: Record<string, unknown> }) => {
  // Atrás de proxy (Render, Railway, Fly), a conexão local é HTTP e o esquema
  // real chega em X-Forwarded-Proto. Sem isto o cookie de sessão sairia sem
  // `Secure` e a sessão poderia cair a cada clique em servidores que exigem HTTPS.
  const encaminhado = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  return encaminhado === "https" || req.protocol === "https";
};

function publicCollection(c: Store["data"]["collections"][number], responses: number) {
  return { ...c, responses };
}

/** Fichas gravadas em bloco: recebem número de versão para não se sobrescreverem. */
const fichasCompletas = new Set(["institution", "matrices", "flows", "systems", "procedures", "diary", "glossary", "improvement"]);

export async function registerAdminRoutes(app: FastifyInstance, store: Store, secret: string) {
  const loginLimit = rateLimiter(8, 10 * 60_000);

  const guard = async (req: Parameters<typeof isAuthenticated>[1], reply: any) => {
    if (!isAuthenticated(store, req)) return reply.code(401).send({ error: "Sessão expirada. Entre novamente." });
  };

  // ── Configuração inicial e sessão ─────────────────────────────
  app.get("/api/setup/status", async () => ({ needsSetup: !store.data.admin, demoLoaded: store.data.demo !== null }));

  app.post<{ Body: { name?: string; email?: string; password?: string } }>("/api/setup", async (req, reply) => {
    if (store.data.admin) return reply.code(409).send({ error: "A configuração já foi concluída." });
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim() || "Estagiário(a)";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(422).send({ error: "Informe um e-mail válido." });
    if (password.length < 8) return reply.code(422).send({ error: "A senha deve ter pelo menos 8 caracteres." });
    store.data.admin = { id: crypto.randomUUID(), email, name, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
    store.note("configuração inicial concluída");
    await store.save();
    await createSession(store, reply, secureCookie, isHttps(req));
    return { ok: true };
  });

  app.post<{ Body: { email?: string; password?: string } }>("/api/login", async (req, reply) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    // Limite por origem: tentar e-mails diferentes não escapa do bloqueio.
    if (!loginLimit(req.ip)) return reply.code(429).send({ error: "Muitas tentativas. Aguarde 10 minutos." });
    const admin = store.data.admin;
    const ok = admin && admin.email === email && (await verifyPassword(String(req.body?.password ?? ""), admin.passwordHash));
    if (!ok) return reply.code(401).send({ error: "E-mail ou senha incorretos." });
    await createSession(store, reply, secureCookie, isHttps(req));
    return { ok: true, name: admin.name };
  });

  app.post("/api/logout", async (req, reply) => {
    destroySession(store, req, reply, { secure: secureCookie && isHttps(req), clearFromJar: isHttps(req) });
    await store.save();
    return { ok: true };
  });

  app.get("/api/me", { preHandler: guard }, async () => {
    const a = store.data.admin!;
    return { name: a.name, email: a.email, displayName: store.data.settings.displayName, settings: store.data.settings };
  });

  // ── Backups diários ───────────────────────────────────────────────
  /** Lista as cópias guardadas ao lado do arquivo de dados. */
  app.get("/api/backups", { preHandler: guard }, async () => ({ backups: store.listarBackups() }));

  /** Baixa uma cópia no formato do arquivo de dados, para guardar fora do servidor. */
  app.get<{ Params: { nome: string } }>("/api/backups/:nome", { preHandler: guard }, async (req, reply) => {
    const conteudo = store.lerBackup(req.params.nome);
    if (conteudo === null) return reply.code(404).send({ error: "Backup não encontrado." });
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${req.params.nome}"`);
    return conteudo;
  });

  // ── Painel (contagens por público) ────────────────────────────────
  app.get("/api/dashboard", { preHandler: guard }, async () => {
    const counts = AUDIENCES.map((audience) => {
      const total = entriesFor(store, audience).length;
      return { audience, total };
    });
    const recent = store.data.entries.map((e) => e.submittedAt).sort().slice(-20).reverse();
    const visits = store.data.visits.slice(-14);
    return {
      counts,
      collections: store.data.collections.map((c) => publicCollection(c, entriesFor(store, c.audience, c.id).length)),
      recent,
      visits,
      demo: store.data.demo,
      missing: buildMissingReportInput(store).length,
      log: store.data.log.slice(-8).reverse(),
    };
  });

  // ── Coletas ─────────────────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: Partial<{ status: string; label: string; opensAt: string | null; closesAt: string | null }> }>(
    "/api/collections/:id",
    { preHandler: guard },
    async (req, reply) => {
      const c = store.data.collections.find((x) => x.id === req.params.id);
      if (!c) return reply.code(404).send({ error: "Coleta não encontrada." });
      const b = req.body ?? {};
      if (b.status && !["rascunho", "aberta", "encerrada"].includes(b.status)) return reply.code(422).send({ error: "Status inválido." });

      // Valida tudo antes de mexer no objeto: um pedido inválido não muda nada.
      const lerData = (valor: string | null | undefined, rotulo: string): string | null | undefined => {
        if (valor === undefined) return undefined;
        if (valor === null || valor === "") return null;
        const d = new Date(valor);
        if (Number.isNaN(d.getTime())) throw Object.assign(new Error(`Prazo inválido: ${rotulo}.`), { campo: rotulo });
        return d.toISOString();
      };
      let closesAt: string | null | undefined;
      let opensAt: string | null | undefined;
      try {
        closesAt = lerData(b.closesAt, "encerramento");
        opensAt = lerData(b.opensAt, "abertura");
      } catch (e) {
        return reply.code(422).send({ error: e instanceof Error ? e.message : "Prazo inválido." });
      }
      if (opensAt && closesAt && closesAt <= opensAt) {
        return reply.code(422).send({ error: "O encerramento precisa ser depois da abertura." });
      }
      if (opensAt && closesAt === undefined && c.closesAt && c.closesAt <= opensAt) {
        return reply.code(422).send({ error: "O encerramento precisa ser depois da abertura." });
      }

      if (b.label !== undefined) c.label = String(b.label).slice(0, 120);
      if (closesAt !== undefined) c.closesAt = closesAt;
      if (opensAt !== undefined) c.opensAt = opensAt;
      if (b.status === "aberta") {
        if (!c.publicId) c.publicId = randomBytes(16).toString("base64url");
        if (c.status !== "aberta" && opensAt === undefined) c.opensAt = new Date().toISOString();
      }
      if (b.status === "rascunho" || b.status === "aberta" || b.status === "encerrada") c.status = b.status;
      store.note("coleta atualizada", `${c.audience}: ${c.status}`);
      await store.save();
      return { collection: publicCollection(c, entriesFor(store, c.audience, c.id).length) };
    },
  );

  /** Links ativos por público, para copiar todos de uma vez. */
  app.get("/api/collections/links", { preHandler: guard }, async () => {
    const links: Record<string, string | null> = {};
    for (const audience of AUDIENCES) {
      const aberta = store.data.collections.find((c) => c.audience === audience && c.status === "aberta" && c.publicId && !c.demo);
      links[audience] = aberta?.publicId ? `/e/${aberta.publicId}` : null;
    }
    return { links };
  });

  app.post<{ Params: { id: string } }>("/api/collections/:id/rotate-link", { preHandler: guard }, async (req, reply) => {
    const c = store.data.collections.find((x) => x.id === req.params.id);
    if (!c) return reply.code(404).send({ error: "Coleta não encontrada." });
    c.publicId = randomBytes(16).toString("base64url");
    store.note("link de coleta regenerado", c.audience);
    await store.save();
    return { collection: publicCollection(c, entriesFor(store, c.audience, c.id).length) };
  });

  /** Gera prova anti-envio repetido (vinculada à sessão anônima do navegador). */
  app.post<{ Body: { collectionPublicId?: string; sessionId?: string } }>("/api/public/surveys/contest", async (req, reply) => {
    const c = collectionByPublicId(store, String(req.body?.collectionPublicId ?? ""));
    const sessionId = String(req.body?.sessionId ?? "");
    if (!c || c.status !== "aberta" || sessionId.length < 20 || sessionId.length > 80) {
      return reply.code(400).send({ error: "Não foi possível preparar o envio." });
    }
    // Cada aparelho responde uma vez: a tela pergunta antes de a pessoa preencher
    // tudo e mostra o aviso aqui, em vez de recusar só no fim.
    const chave = await answeredBy(secret, sessionId);
    if ((store.data.contest[c.id] ?? []).some((x) => x.sessionId === chave)) {
      return reply.code(409).send({ error: "Este aparelho já enviou uma resposta a este questionário." });
    }
    return { proof: await issueAntibotToken(store, secret, c.id, sessionId) };
  });

  // ── Resultados ──────────────────────────────────────────────────
  app.get<{ Params: { audience: string } }>("/api/results/:audience", { preHandler: guard }, async (req, reply) => {
    const aud = req.params.audience;
    if (!isAudience(aud)) return reply.code(400).send({ error: "Público inválido." });
    const entries = entriesFor(store, aud);
    const summary = analyzeAudience(getSurvey(aud), entries.map((e) => ({ answers: toRaw(e.answers) })));
    const themes = groupThemes(store, aud);
    const texts = openResponsesFor(store, aud)
      .map((r) => ({ id: r.id, questionId: r.questionId, text: r.text, themeIds: effectiveThemeIds(r), manual: r.manualThemeId != null }));
    // Totais dos três públicos: as abas já mostram os números sem abrir cada uma.
    const totals = Object.fromEntries(AUDIENCES.map((a) => [a, entriesFor(store, a).length]));
    return { summary, themes: store.data.themes, openResponses: texts, totals };
  });

  app.put<{ Params: { id: string }; Body: { themeId?: string | null } }>("/api/open-responses/:id/theme", { preHandler: guard }, async (req, reply) => {
    const r = store.data.openResponses.find((x) => x.id === req.params.id);
    if (!r) return reply.code(404).send({ error: "Resposta não encontrada." });
    const themeId = req.body?.themeId ?? null;
    if (themeId !== null && !store.data.themes.some((t) => t.id === themeId)) return reply.code(422).send({ error: "Tema desconhecido." });
    // string vazia = correção manual para "sem tema"; null = volta à sugestão automática.
    r.manualThemeId = themeId === null ? null : String(themeId);
    store.note("tema de resposta aberta ajustado");
    await store.save();
    return { ok: true, themeIds: effectiveThemeIds(r) };
  });

  app.get("/api/themes", { preHandler: guard }, async () => ({ themes: store.data.themes }));

  app.post<{ Body: { label?: string } }>("/api/themes", { preHandler: guard }, async (req, reply) => {
    const label = String(req.body?.label ?? "").trim();
    if (label.length < 2) return reply.code(422).send({ error: "Informe o nome do tema." });
    const theme = { id: `tema-${randomBytes(4).toString("hex")}`, label: label.slice(0, 60), keywords: [] };
    store.data.themes.push(theme);
    await store.save();
    return { theme };
  });

  // ── Fichas de campo ─────────────────────────────────────────────
  /** Ficha 3: cria um fluxo a partir de um modelo (ex.: bolsa de monitoria) ou em branco. */
  app.post<{ Body: { templateId?: string } }>("/api/records/flows", { preHandler: guard }, async (req) => {
    const tpl = FLOW_TEMPLATES.find((t) => t.id === req.body?.templateId);
    const seq = store.data.flows.length + 1;
    const flow: Flow = {
      id: randomBytes(6).toString("hex"),
      name: tpl ? `${tpl.name} (${seq})` : `Fluxo ${seq}`,
      process: tpl?.process ?? "",
      steps: tpl
        ? tpl.steps.map((s) => ({
            id: randomBytes(6).toString("hex"),
            stage: s.stage,
            who: "",
            docSystem: s.docSystem ?? "",
            deadline: s.deadline ?? "",
            blocker: "",
          }))
        : [{ id: randomBytes(6).toString("hex"), stage: "", who: "", docSystem: "", deadline: "", blocker: "" }],
    };
    store.data.flows.push(flow);
    store.note("fluxo criado", flow.name);
    await store.save();
    return { flow };
  });

  /** Estado das fichas: a leitura também devolve a última versão aceita por ficha. */
  app.get("/api/records", { preHandler: guard }, async () => ({
    institution: store.data.institution,
    flows: store.data.flows,
    systems: store.data.systems,
    procedures: store.data.procedures,
    improvement: store.data.improvement,
    diary: store.data.diary,
    glossary: store.data.glossary,
    matrices: store.data.matrices,
    settings: store.data.settings,
    recordVersions: store.data.recordVersions,
  }));

  app.put<{ Params: { kind: string } }>("/api/records/:kind", { preHandler: guard }, async (req, reply) => {
    const kind = req.params.kind;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stamp = new Date().toISOString();
    const versao = Number(body.versao);
    // Duas gravações completas que se cruzam: a mais velha não pode sobrescrever
    // a mais nova. O cliente numera cada lote e o servidor guarda o último usado.
    if (fichasCompletas.has(kind) && Number.isFinite(versao)) {
      const ultima = store.data.recordVersions[kind] ?? 0;
      // Versão 1 num servidor que já recebeu gravações é um navegador novo (contador
      // zerado, outra aba, novos dados): ela não pode ser confundida com gravação
      // velha e descartada. Nesse caso o cliente recarrega e renumera (409).
      if (versao === 1 && ultima > 0) {
        return reply.code(409).send({ error: "A ficha foi aberta de novo em outro momento. Recarregue e edite outra vez.", versao: ultima });
      }
      if (versao <= ultima) return reply.code(200).send({ ok: true, savedAt: stamp, versao: ultima, ignorado: true });
    }
    // Chaves que este envio toca, na hora de responder e depois de gravar.
    const chaves = fichasCompletas.has(kind) ? chavesDe(kind, body) : [];
    /** Linhas e campos que têm cópia anterior guardada agora (o "Desfazer" da tela). */
    const copias: Record<string, boolean> = {};
    const responder = () => {
      // O servidor devolve a versão de cada linha que o envio tocou e se ela
      // tem cópia anterior guardada: é o que o botão "Desfazer" da tela lê.
      const versoes: Record<string, number> = {};
      for (const c of chaves) {
        const v = store.data.recordVersions[c];
        if (Number.isFinite(v)) versoes[c] = v;
      }
      return reply.send({
        ok: true,
        savedAt: stamp,
        versao: Number.isFinite(versao) ? versao : undefined,
        versoes: Object.keys(versoes).length ? versoes : undefined,
        copias: Object.keys(copias).length ? copias : undefined,
      });
    };
    const antes = conteudoDe(kind, store.data);
    // Recusa: só a resposta de erro leva o 400 (o código preso à resposta
    // marcaria de erro a gravação que deu certo).
    const x = { send: (corpo: { error: string }, status = 400) => reply.code(status).send(corpo) };
    switch (kind) {
      case "institution": {
        // A primeira edição pode chegar só com os números (ou só com os campos):
        // o que não veio fica como estava, sem apagar o que já estava gravado.
        const atual = store.data.institution;
        const campos = body.fields !== undefined ? asStringMap(body.fields) : atual.fields;
        const numeros = Array.isArray(body.numbers) ? (body.numbers as any[]).map(normalizeNumberRow) : atual.numbers;
        store.data.institution = { fields: campos, numbers: numeros, updatedAt: stamp };
        break;
      }
      case "settings": {
        // Só os campos conhecidos entram: o envio não pode gravar chaves soltas
        // no registro, nem trocar o carimbo por conta própria.
        const atual = store.data.settings;
        const data = (v: unknown, anterior: string) =>
          typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : v === "" ? "" : anterior;
        const limite = Number(body.rateLimitPerHour);
        const startDate = data(body.startDate, atual.startDate);
        const endDate = data(body.endDate, atual.endDate);
        if (startDate && endDate && endDate < startDate) {
          return x.send({ error: "A previsão de término precisa ser depois do início." }, 422);
        }
        store.data.settings = {
          displayName: texto(body.displayName) || atual.displayName,
          startDate,
          endDate,
          supervisor: texto(body.supervisor),
          course: texto(body.course),
          rateLimitPerHour: Number.isFinite(limite) ? Math.min(200, Math.max(0, Math.round(limite))) : atual.rateLimitPerHour,
          updatedAt: stamp,
        };
        break;
      }
      case "improvement":
        store.data.improvement = {
          id: "principal",
          idea: String(body.idea ?? ""),
          fiveW2H: asStringMap(body.fiveW2H),
          pdca: asStringMap(body.pdca),
          updatedAt: stamp,
        };
        break;
      case "matrices": {
        const m = body as unknown as Matrices;
        // As frases prontas do relatório não vêm no envio da tela: sem elas
        // gravadas aqui, cada salvamento apagaria o que já estava escrito.
        const notas = isPlain(body.notes) ? asStringMap(body.notes) : store.data.matrices.notes ?? {};
        store.data.matrices = { ...normalizeMatrices(m), notes: notas };
        break;
      }
      case "flows": {
        if (!Array.isArray(body.flows)) return x.send({ error: "Fluxos inválidos." });
        store.data.flows = body.flows.map((f: any) => ({
          id: String(f.id ?? crypto.randomUUID()),
          name: String(f.name ?? "").slice(0, 160),
          process: String(f.process ?? "").slice(0, 300),
          steps: (Array.isArray(f.steps) ? f.steps : []).map((s: any) => ({
            id: String(s.id ?? crypto.randomUUID()),
            stage: String(s.stage ?? ""),
            who: String(s.who ?? ""),
            docSystem: String(s.docSystem ?? ""),
            deadline: String(s.deadline ?? ""),
            blocker: String(s.blocker ?? ""),
          })),
        }));
        break;
      }
      case "systems":
        if (!Array.isArray(body.systems)) return x.send({ error: "Sistemas inválidos." });
        store.data.systems = body.systems.map((s: any) => ({
          id: String(s.id ?? crypto.randomUUID()),
          name: String(s.name ?? "").slice(0, 160),
          fields: asStringMap(s.fields),
        }));
        break;
      case "procedures":
        if (!Array.isArray(body.procedures)) return x.send({ error: "Procedimentos inválidos." });
        store.data.procedures = body.procedures.map((p: any) => ({
          id: String(p.id ?? crypto.randomUUID()),
          procedure: String(p.procedure ?? ""),
          base: String(p.base ?? ""),
          responsible: String(p.responsible ?? ""),
          deadline: String(p.deadline ?? ""),
          // Marcas da planilha de origem: o trecho fixo continua fixo ao reler.
          ...(p.fixedBase ? { fixedBase: true } : {}),
          ...(p.note ? { note: String(p.note) } : {}),
        }));
        break;
      case "diary":
        if (!Array.isArray(body.rows)) return x.send({ error: "Registros inválidos." });
        store.data.diary = body.rows.map((r: any) => ({
          id: String(r.id ?? crypto.randomUUID()),
          date: String(r.date ?? ""),
          observation: String(r.observation ?? ""),
          source: String(r.source ?? ""),
          question: String(r.question ?? ""),
        }));
        break;
      case "glossary":
        if (!Array.isArray(body.rows)) return x.send({ error: "Verbetes inválidos." });
        store.data.glossary = body.rows.map((r: any) => ({
          id: String(r.id ?? crypto.randomUUID()),
          acronym: String(r.acronym ?? ""),
          meaning: String(r.meaning ?? ""),
          source: String(r.source ?? ""),
        }));
        break;
      default:
        return reply.code(404).send({ error: "Ficha desconhecida." });
    }
    // Guarda cópia do que mudou antes de dar o conteúdo como novo. Os carimbos
    // de hora ficam fora da comparação: só mudar o horário não conta.
    if (fichasCompletas.has(kind)) {
      registrarMudancas(store.data, kind, antes, conteudoDe(kind, store.data), Number.isFinite(versao) ? versao : 0, stamp);
    }
    // A cópia é a que ficou guardada agora — a gravação velha já saiu acima.
    for (const c of chaves) if (anterior(store.data, c)) copias[c] = true;
    store.note(`ficha salva`, kind);
    // A versão só avança depois de tudo computado; ficha desconhecida não gasta número.
    if (fichasCompletas.has(kind) && Number.isFinite(versao)) store.data.recordVersions[kind] = versao;
    await store.save();
    return responder();
  });

  /** Última cópia guardada de cada linha e de cada campo da ficha 1. */
  app.get("/api/history", { preHandler: guard }, async () => {
    const itens: Record<string, { at: string; versao: number }> = {};
    for (const [chave, lista] of Object.entries(store.data.history)) {
      const ultima = lista[lista.length - 1];
      if (ultima) itens[chave] = { at: ultima.at, versao: ultima.versao };
    }
    return { itens };
  });

  /**
   * Volta uma linha (ou um campo da ficha 1) ao conteúdo da cópia guardada.
   * A linha removida volta para onde estava; se a posição já não existir, vai
   * para o fim. A ficha ganha versão nova, então uma tela aberta em outro
   * lugar recarrega em vez de sobrescrever a volta atrás.
   */
  app.post<{ Params: { chave: string } }>("/api/history/:chave/restore", { preHandler: guard }, async (req, reply) => {
    const chave = decodeURIComponent(req.params.chave);
    const copia = anterior(store.data, chave);
    if (!copia) return reply.code(404).send({ error: "Não há cópia guardada para esta linha." });
    const restaurada = restaurar(store.data, chave);
    if (!restaurada) return reply.code(404).send({ error: "Esta linha não existe mais nesta ficha." });
    store.note("conteúdo anterior restaurado", chave);
    await store.save();
    return { ok: true, chave, kind: restaurada };
  });


  // ── Relatório ───────────────────────────────────────────────────
  app.get("/api/report", { preHandler: guard }, async () => {
    return { report: buildReport(reportInput(store)) };
  });

  /** Documento completo para impressão/PDF (mesmo conteúdo do relatório). */
  app.get("/api/report/document", { preHandler: guard }, async (_req, reply) => {
    const model = buildReport(reportInput(store));
    reply.type("text/html; charset=utf-8");
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    reply.header("Cache-Control", "no-store");
    return reply.send(renderReportDocument(model));
  });

  // ── Demonstração ───────────────────────────────────────────────
  // Exigem o cabeçalho do cliente, como qualquer gravação: só o próprio painel
  // aciona a demonstração.
  app.post("/api/demo/seed", { preHandler: guard }, async (req, reply) => {
    if (req.headers["x-nupe-client"] !== "web") return reply.code(403).send({ error: "Requisição recusada." });
    await seedDemo(store);
    return { ok: true };
  });
  app.post("/api/demo/clear", { preHandler: guard }, async (req, reply) => {
    if (req.headers["x-nupe-client"] !== "web") return reply.code(403).send({ error: "Requisição recusada." });
    await limparDemo(store);
    return { ok: true };
  });
}

function entriesFor(store: Store, audience: Audience, collectionId?: string) {
  // A demonstração também conta nos resultados: é para isso que ela existe.
  // O painel separa as coletas e o "Remover dados fictícios" apaga tudo junto.
  const ids = new Set(
    store.data.collections
      .filter((c) => c.audience === audience && (!collectionId || c.id === collectionId))
      .map((c) => c.id),
  );
  return store.data.entries.filter((e) => ids.has(e.collectionId));
}

/** Respostas abertas do público (a demonstração, quando carregada, também conta). */
function openResponsesFor(store: Store, audience?: Audience) {
  return store.data.openResponses.filter((r) => !audience || r.audience === audience);
}

function toRaw(answers: { questionId: string; value: unknown }[]): RawAnswers {
  const out: RawAnswers = {};
  for (const a of answers) out[a.questionId] = a.value as any;
  return out;
}

function groupThemes(store: Store, audience: Audience) {
  const rows = openResponsesFor(store, audience);
  const groups = new Map<string, { label: string; count: number; examples: string[] }>();
  for (const r of rows) {
    const ids = effectiveThemeIds(r);
    if (ids.length === 0) {
      const g = groups.get("sem-tema") ?? { label: "Sem tema (revisar)", count: 0, examples: [] };
      g.count += 1;
      if (g.examples.length < 4) g.examples.push(r.text.slice(0, 160));
      groups.set("sem-tema", g);
      continue;
    }
    for (const id of ids) {
      const label = store.data.themes.find((t) => t.id === id)?.label ?? id;
      const g = groups.get(id) ?? { label, count: 0, examples: [] };
      g.count += 1;
      if (g.examples.length < 4) g.examples.push(r.text.slice(0, 160));
      groups.set(id, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function buildMissingReportInput(store: Store) {
  return buildMissing(reportInput(store, false));
}

function reportInput(store: Store, withThemes = true): ReportInput {
  const summaries: ReportInput["summaries"] = {};
  for (const a of AUDIENCES) {
    const entries = entriesFor(store, a).map((e) => ({ answers: toRaw(e.answers) }));
    summaries[a] = analyzeAudience(SURVEYS[a], entries);
  }
  const themeGroups = withThemes ? AUDIENCES.flatMap((a) => groupThemes(store, a)) : [];
  return {
    generatedAt: new Date().toISOString(),
    period: [store.data.settings.startDate, store.data.settings.endDate].filter(Boolean).join(" a "),
    summaries,
    institution: {
      fields: store.data.institution.fields,
      numbers: store.data.institution.numbers.map((n) => ({ indicator: n.indicator, value: n.value, source: n.source })),
    },
    flows: store.data.flows.map((f) => ({ name: f.name, process: f.process, steps: f.steps })),
    systems: store.data.systems.map((s) => ({
      name: s.name,
      fields: Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [labelSystemField(k), v])),
    })),
    matrices: store.data.matrices,
    improvement: { idea: store.data.improvement.idea, fiveW2H: store.data.improvement.fiveW2H, pdca: store.data.improvement.pdca },
    procedures: store.data.procedures.map((p) => ({ ...p })),
    diaryCount: store.data.diary.filter((d) => d.observation.trim()).length,
    themeGroups,
    audienceLabels: { docentes: "Docentes", estudantes: "Estudantes", equipe: "Equipe do NUPE" },
  };
}

function labelSystemField(key: string) {
  const map: Record<string, string> = {
    nomeFinalidade: "Nome e finalidade",
    quemUsa: "Quem usa",
    oQueEntra: "O que entra (dados e documentos)",
    oQueSai: "O que sai (relatórios e registros)",
    errosComuns: "Dúvidas e erros mais comuns",
    suporte: "Quem dá suporte",
  };
  return map[key] ?? key;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Texto do envio, no formato em que o servidor guarda: inteiro vira texto. */
function texto(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 4000) : v == null ? "" : String(v).slice(0, 4000);
}

/**
 * O conteúdo enviado está igual ao que o servidor guarda? Compara na forma
 * gravada (número vira texto, lista de matrizes junta as colunas), porque é
 * isso que o botão "Desfazer" da tela está vendo.
 */
function naFormaGuardada(kind: string, chave: string, database: DB, body: Record<string, unknown>): boolean {
  const campos = /^(.+?):campo:(.+)$/.exec(chave);
  if (campos && campos[2]) {
    const campo = campos[2];
    const enviado =
      kind === "institution" ? (isPlain(body.fields) ? body.fields[campo] : undefined) : valorDaFicha6(body, campo);
    const guardado = kind === "institution" ? database.institution.fields?.[campo] ?? "" : valorDaFicha6(database.improvement, campo);
    return texto(enviado) === String(guardado ?? "");
  }
  const m = /^(.+?):linha:(.+)$/.exec(chave);
  if (!m || !m[2]) return false;
  const id = m[2];
  const lista = (nome: string) => (Array.isArray(body[nome]) ? (body[nome] as Array<{ id?: unknown }>) : []);
  let itens: Array<{ id?: unknown }> = [];
  if (kind === "flows") itens = lista("flows");
  else if (kind === "systems") itens = lista("systems");
  else if (kind === "procedures") itens = lista("procedures");
  else if (kind === "diary" || kind === "glossary") itens = lista("rows");
  else if (kind === "institution") itens = lista("numbers");
  else if (kind === "matrices") {
    const mm = body as unknown as Matrices;
    for (const grupo of [mm.porter, mm.swot]) {
      for (const l of Object.values(grupo ?? {})) if (Array.isArray(l)) itens.push(...l);
    }
    if (Array.isArray(mm.gut)) itens.push(...mm.gut);
  }
  const enviado = itens.find((x) => x.id === id);
  const atual = itensDe(kind, conteudoDe(kind, database)).find((x) => x.id === id)?.item;
  return !!enviado && !!atual && JSON.stringify(enviado) === JSON.stringify(atual);
}

/** Valor de um campo da ficha 6 no corpo enviado. */
function valorDaFicha6(conteudo: unknown, campo: string): string {
  const c = (conteudo ?? {}) as { idea?: unknown; fiveW2H?: Record<string, unknown>; pdca?: Record<string, unknown> };
  const [grupo, chave] = campo.split(".");
  if (!chave) return texto(c.idea);
  const mapa = grupo === "pdca" ? c.pdca : c.fiveW2H;
  return texto(mapa?.[chave]);
}

/** Chaves de versão das linhas e dos campos da ficha 1 que este envio carrega. */
function chavesDe(kind: string, b: Record<string, unknown>): string[] {
  return chavesDoLote(kind, b);
}

function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof val === "string" ? val.slice(0, 4000) : val == null ? "" : String(val).slice(0, 4000);
  }
  return out;
}

function normalizeNumberRow(r: any) {
  return {
    id: String(r?.id ?? crypto.randomUUID()),
    indicator: String(r?.indicator ?? ""),
    value: String(r?.value ?? ""),
    source: String(r?.source ?? ""),
  };
}
function normalizeMatrices(m: Matrices): Matrices {
  // A nota 0 conta como ausente: no GUT ela vira 1 no relatório, mas não pode
  // mudar de sentido ao ser gravada e relida.
  const nota = (v: unknown) => (v ? Number(v) : undefined);
  const item = (x: any) => ({
    id: String(x?.id ?? crypto.randomUUID()),
    text: String(x?.text ?? ""),
    gravity: nota(x?.gravity),
    urgency: nota(x?.urgency),
    tendency: nota(x?.tendency),
    linkedStrengthId: x?.linkedStrengthId ? String(x.linkedStrengthId) : undefined,
    evidence: x?.evidence ? String(x.evidence) : undefined,
  });
  const list = (x: any) => (Array.isArray(x) ? x.map(item) : []);
  return {
    porter: {
      clientes: list(m?.porter?.clientes),
      fornecedores: list(m?.porter?.fornecedores),
      concorrentes: list(m?.porter?.concorrentes),
      novosEntrantes: list(m?.porter?.novosEntrantes),
      substitutos: list(m?.porter?.substitutos),
    },
    swot: {
      forcas: list(m?.swot?.forcas),
      fraquezas: list(m?.swot?.fraquezas),
      oportunidades: list(m?.swot?.oportunidades),
      ameacas: list(m?.swot?.ameacas),
    },
    gut: list(m?.gut),
    notes: asStringMap(m?.notes),
  };
}

export { computeGut, buildNextSteps };
