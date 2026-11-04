import type { FastifyInstance } from "fastify";
import {
  SUGGESTED_THEMES,
  SURVEYS,
  isAudience,
  scrubOpenText,
  suggestThemeIds,
  validateSubmission,
  type Audience,
  type Collection,
} from "@nupe/core";
import type { Store } from "./db";
import { rateLimiter } from "./auth";

/** Hash opaco do par sessionId+token; não permite recuperar o endereço. */
async function anonymousHmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(sig).toString("base64url");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function collectionAvailability(c: Collection): "aberta" | "encerrada" | "indisponivel" {
  if (c.status === "encerrada") return "encerrada";
  if (c.status !== "aberta") return "indisponivel";
  const now = nowIso();
  if (c.opensAt && now < c.opensAt) return "indisponivel";
  if (c.closesAt && now > c.closesAt) return "encerrada";
  return "aberta";
}

async function issueToken(
  store: Store,
  secret: string,
  key: string,
  sessionId: string,
): Promise<string> {
  const nonce = crypto.randomUUID();
  const list = (store.data.contest[key] ??= []);
  list.push({ sessionId, createdAt: nowIso() });
  // Mantém curta a janela de contestação (24 h).
  const horizon = Date.now() - 24 * 3600_000;
  const fresh = list.filter((c) => new Date(c.createdAt).getTime() > horizon);
  if (fresh.length !== list.length) store.data.contest[key] = fresh;

  const issued = Math.floor(Date.now() / 300_000);
  const { createHash } = await import("node:crypto");
  const proof = createHash("sha256").update(`${secret}|${key}|${sessionId}|${nonce}|${issued}`).digest("hex");
  await store.save();
  return `${nonce}.${issued}.${proof}`;
}

async function verifyAntibotProof(secret: string, key: string, sessionId: string, proof: string): Promise<boolean> {
  const parts = proof.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedStr, given] = parts;
  const issued = Number(issuedStr);
  if (!Number.isFinite(issued)) return false;
  const now = Math.floor(Date.now() / 300_000);
  if (issued !== now && issued !== now - 1) return false;
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(`${secret}|${key}|${sessionId}|${nonce}|${issued}`).digest("hex");
  return expected === given;
}

export async function registerPublicRoutes(app: FastifyInstance, store: Store, secret: string) {
  // Limite por aparelho e por IP. São altos de propósito: numa sala de aula os
  // alunos chegam pelo mesmo IP, e a proteção contra repetição já é o aparelho.
  const submitPorAparelho = rateLimiter(8, 10 * 60_000);
  const submitPorIp = rateLimiter(200, 10 * 60_000);
  const sessionLimit = rateLimiter(300, 10 * 60_000);
  const reciboLimit = rateLimiter(120, 10 * 60_000);

  app.get("/api/public/health", async () => ({ ok: true, time: nowIso() }));

  app.get<{ Params: { id: string } }>("/api/public/surveys/:id", async (req) => {
    const c = store.data.collections.find((x) => x.publicId === req.params.id);
    // Conta abertura da página: apenas um contador por dia, sem identificador.
    if (c) {
      const today = nowIso().slice(0, 10);
      const v = store.data.visits.find((x) => x.date === today);
      if (v) v.count += 1;
      else store.data.visits = [...store.data.visits, { date: today, count: 1 }].slice(-400);
      await store.save();
    }
    if (!c || c.status === "rascunho") return { survey: null };
    const survey = SURVEYS[c.audience];
    return {
      survey: {
        audience: c.audience,
        title: survey.title,
        intro: survey.intro,
        questions: survey.questions,
        status: collectionAvailability(c),
        closesAt: c.closesAt,
        requireCaptcha: false,
      },
      session: { id: null },
    };
  });

  /** Cria uma sessão anônima (cookie) — só existe para limitar envios repetidos. */
  app.post("/api/public/session", async (req, reply) => {
    if (!sessionLimit(req.ip)) return reply.code(429).send({ error: "Muitas tentativas. Tente novamente mais tarde." });
    return reply.code(201).send({ ok: true });
  });

  app.post<{ Params: { id: string }; Body: { answers?: unknown; sessionId?: string; proof?: string } }>(
    "/api/public/surveys/:id/responses",
    async (req, reply) => {
      if (!submitPorIp(req.ip)) return reply.code(429).send({ error: "Muitos envios deste endereço. Aguarde alguns minutos." });
      const c = store.data.collections.find((x) => x.publicId === req.params.id);
      if (!c) return reply.code(404).send({ error: "Questionário indisponível." });
      if (collectionAvailability(c) !== "aberta") {
        return reply.code(409).send({ error: "Esta coleta está encerrada." });
      }
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      if (!sessionId || sessionId.length < 20 || sessionId.length > 80) {
        return reply.code(400).send({ error: "Sessão inválida. Recarregue a página." });
      }
      if (!submitPorAparelho(sessionId)) return reply.code(429).send({ error: "Muitos envios deste dispositivo. Aguarde alguns minutos." });
      const proof = typeof req.body?.proof === "string" ? req.body.proof : "";
      if (!(await verifyAntibotProof(secret, c.id, sessionId, proof))) {
        return reply.code(400).send({ error: "Verificação de envio expirada. Recarregue a página." });
      }
      const answeredSession = await anonymousHmac(secret, sessionId);
      const already = (store.data.contest[c.id] ?? []).find((x) => x.sessionId === answeredSession);
      if (already) return reply.code(409).send({ error: "Este dispositivo já enviou uma resposta a este questionário." });

      const survey = SURVEYS[c.audience];
      const answers = (req.body?.answers ?? {}) as Record<string, string | string[] | number | null>;
      const errors = validateSubmission(survey, answers);
      if (errors.length) return reply.code(422).send({ error: errors[0], errors });

      const entryId = crypto.randomUUID();
      const submittedAt = nowIso();
      const cleaned = survey.questions.map((q) => {
        const raw = answers[q.id];
        let value: string | string[] | number | null = null;
        if (q.type === "open") value = typeof raw === "string" ? scrubOpenText(raw) : null;
        else if (q.type === "multi") value = Array.isArray(raw) ? [...new Set(raw.filter((x) => typeof x === "string"))] : [];
        else if (q.type === "scale") value = Number(raw);
        else value = typeof raw === "string" ? raw : null;
        return { questionId: q.id, value };
      });

      store.data.entries.push({ id: entryId, collectionId: c.id, submittedAt, answers: cleaned });

      for (const a of cleaned) {
        if (typeof a.value !== "string" || a.value.length === 0) continue;
        const q = survey.questions.find((x) => x.id === a.questionId);
        if (q?.type !== "open") continue;
        store.data.openResponses.push({
          id: crypto.randomUUID(),
          entryId,
          collectionId: c.id,
          audience: c.audience,
          questionId: q.id,
          text: a.value,
          themeIds: suggestThemeIds(a.value, store.data.themes.length ? store.data.themes : SUGGESTED_THEMES),
          manualThemeId: null,
          createdAt: submittedAt,
        });
      }

      // Marca a sessão como respondida (hash opaco: não permite reverter ao IP).
      const list = store.data.contest[c.id] ?? [];
      list.push({ sessionId: answeredSession, createdAt: submittedAt });
      store.data.contest[c.id] = list;
      await store.save();
      store.note("resposta recebida", c.audience);
      return reply.code(201).send({ ok: true });
    },
  );

  app.get("/api/public/stats/:audience/responses", async (req, reply) => {
    const { audience } = req.params as { audience: string };
    if (!isAudience(audience)) return reply.code(400).send({ error: "Público inválido." });
    const open = store.data.collections.find((c) => c.audience === audience && c.status === "aberta");
    const total = store.data.entries.filter((e) => {
      const c = store.data.collections.find((x) => x.id === e.collectionId);
      return c?.audience === audience;
    }).length;
    return { audience, total, open: Boolean(open) };
  });

  /**
   * O aparelho pergunta se já respondeu este questionário. A resposta fica
   * guardada no navegador: o cookie da sessão anônima pode sumir, e sem isto a
   * pessoa preencheria tudo de novo para receber um recado no fim.
   */
  app.post<{ Params: { id: string }; Body: { sessionId?: string } }>(
    "/api/public/surveys/:id/recibo",
    async (req, reply) => {
      if (!reciboLimit(req.ip)) return reply.code(429).send({ error: "Muitas consultas. Aguarde alguns minutos." });
      const c = store.data.collections.find((x) => x.publicId === req.params.id);
      if (!c) return reply.code(404).send({ error: "Questionário indisponível." });
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      const respondido = !!sessionId && sessionId.length >= 20 &&
        (store.data.contest[c.id] ?? []).some((x) => x.sessionId === sessionId);
      return { respondido };
    },
  );
}

export async function issueAntibotToken(store: Store, secret: string, collectionId: string, sessionId: string) {
  return issueToken(store, secret, collectionId, sessionId);
}

export { anonymousHmac };
export { verifyAntibotProof };
export const PUBLIC_AUDIENCES: Audience[] = ["docentes", "estudantes", "equipe"];
