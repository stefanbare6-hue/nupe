/**
 * Testes da API sobre uma instância real, em porta efêmera e arquivo temporário.
 * Cada bloco sobe um servidor novo para não herdar contadores de limite.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Store } from "../src/db";
import { buildApp } from "../src/app";

const EMAIL = "teste@nupe.br";
const SENHA = "senha-de-teste-1";
const SEGREDO = "segredo-de-teste";

interface Laboratorio {
  app: FastifyInstance;
  base: string;
  store: Store;
  fechar: () => Promise<void>;
}

const abertos: Laboratorio[] = [];

async function laboratorio(prefixo = ""): Promise<Laboratorio> {
  const dir = mkdtempSync(join(tmpdir(), "nupe-teste-"));
  const store = await Store.open(join(dir, "dados.json"));
  const app = await buildApp({ store, secret: SEGREDO, webDist: null });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const endereco = app.server.address();
  const porta = typeof endereco === "object" && endereco ? endereco.port : 0;
  const base = `http://127.0.0.1:${porta}`;
  const lab: Laboratorio = {
    app,
    base,
    store,
    fechar: async () => {
      await app.close();
      await store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
  abertos.push(lab);
  void prefixo;
  return lab;
}

afterAll(async () => {
  for (const l of abertos) await l.fechar().catch(() => {});
});

function cabecalhos(base: string, cookie?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-nupe-client": "web",
    origin: base,
    ...(cookie ? { cookie } : {}),
  };
}

async function chamar(base: string, metodo: string, caminho: string, corpo?: unknown, cookie?: string) {
  const res = await fetch(base + caminho, {
    method: metodo,
    headers: cabecalhos(base, cookie),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    redirect: "manual",
  });
  const texto = await res.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, texto, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

async function entrar(base: string) {
  const r = await chamar(base, "POST", "/api/login", { email: EMAIL, password: SENHA });
  expect(r.status).toBe(200);
  return r.cookie;
}

const RESPOSTAS_ESTUDANTE = {
  e1: "letras",
  e2: ["extensao", "pesquisa"],
  e3: "em_parte",
  e4: ["grupos", "professores"],
  e5: ["falta_informacao"],
  e6: 3,
  e7: "sim",
  e8: "Criar um canal no WhatsApp com os editais. (teste)",
};

describe("configuração e acesso", () => {
  let lab: Laboratorio;
  beforeAll(async () => {
    lab = await laboratorio();
  });

  it("começa sem administrador e exige a configuração inicial", async () => {
    const r = await chamar(lab.base, "GET", "/api/setup/status");
    expect(r.json).toEqual({ needsSetup: true, demoLoaded: false });
    expect((await chamar(lab.base, "GET", "/api/me")).status).toBe(401);
  });

  it("recusa configuração com e-mail ou senha inválidos", async () => {
    expect((await chamar(lab.base, "POST", "/api/setup", { email: "sem-arroba", password: SENHA })).status).toBe(422);
    expect((await chamar(lab.base, "POST", "/api/setup", { email: EMAIL, password: "curta" })).status).toBe(422);
  });

  it("conclui a configuração e já abre a sessão", async () => {
    const r = await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL.toUpperCase(), password: SENHA });
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/^nupe_sid=/);
    const me = await chamar(lab.base, "GET", "/api/me", undefined, r.cookie);
    expect(me.status).toBe(200);
    expect(me.json.email).toBe(EMAIL);
    expect(me.json.name).toBe("Pessoa de Teste");
  });

  it("não aceita configurar duas vezes", async () => {
    const r = await chamar(lab.base, "POST", "/api/setup", { email: "outro@nupe.br", password: SENHA });
    expect(r.status).toBe(409);
  });

  it("recusa senha errada e entende o e-mail sem diferenciar maiúsculas", async () => {
    expect((await chamar(lab.base, "POST", "/api/login", { email: EMAIL, password: "errada" })).status).toBe(401);
    expect((await chamar(lab.base, "POST", "/api/login", { email: " TESTE@nupe.br ", password: SENHA })).status).toBe(200);
  });

  it("o cookie de sessão é httpOnly e SameSite=Strict", async () => {
    const res = await fetch(lab.base + "/api/login", {
      method: "POST",
      headers: cabecalhos(lab.base),
      body: JSON.stringify({ email: EMAIL, password: SENHA }),
    });
    const bruto = res.headers.get("set-cookie") ?? "";
    expect(bruto).toMatch(/HttpOnly/i);
    expect(bruto).toMatch(/SameSite=Strict/i);
    expect(bruto).toMatch(/Path=\//);
  });

  it("sair invalida o cookie usado", async () => {
    const cookie = await entrar(lab.base);
    expect((await chamar(lab.base, "POST", "/api/logout", {}, cookie)).status).toBe(200);
    expect((await chamar(lab.base, "GET", "/api/me", undefined, cookie)).status).toBe(401);
  });

  it("sanitiza o corpo gigante e recusa mutação sem cabeçalho do cliente", async () => {
    const cookie = await entrar(lab.base);
    const semCabecalho = await fetch(lab.base + "/api/records/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    });
    expect(semCabecalho.status).toBe(403);
    const outraOrigem = await fetch(lab.base + "/api/records/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-nupe-client": "web", origin: "https://site-externo.example", cookie },
      body: "{}",
    });
    expect(outraOrigem.status).toBe(403);
  });
});

describe("coletas e questionário público", () => {
  let lab: Laboratorio;
  let cookie: string;
  let publicId: string;

  beforeAll(async () => {
    lab = await laboratorio();
    await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL, password: SENHA });
    cookie = await entrar(lab.base);
  });

  it("as três coletas nascem em rascunho", async () => {
    const r = await chamar(lab.base, "GET", "/api/dashboard", undefined, cookie);
    expect(r.status).toBe(200);
    expect(r.json.collections.map((c: any) => c.audience).sort()).toEqual(["docentes", "equipe", "estudantes"]);
    expect(r.json.collections.every((c: any) => c.status === "rascunho")).toBe(true);
  });

  it("rascunho não aparece no link público", async () => {
    const c = lab.store.data.collections.find((x) => x.audience === "estudantes")!;
    const r = await chamar(lab.base, "GET", `/api/public/surveys/${c.publicId ?? "nada"}`);
    expect(r.json).toEqual({ survey: null });
  });

  it("abrir a coleta gera link estável", async () => {
    const c = lab.store.data.collections.find((x) => x.audience === "estudantes")!;
    const r = await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { status: "aberta" }, cookie);
    expect(r.status).toBe(200);
    publicId = r.json.collection.publicId;
    expect(publicId.length).toBeGreaterThan(20);
    const segunda = await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { status: "aberta" }, cookie);
    expect(segunda.json.collection.publicId).toBe(publicId);
    const links = await chamar(lab.base, "GET", "/api/collections/links", undefined, cookie);
    expect(links.json.links.estudantes).toBe(`/e/${publicId}`);
    expect(links.json.links.docentes).toBeNull();
  });

  it("prazo inválido é recusado", async () => {
    const c = lab.store.data.collections.find((x) => x.audience === "estudantes")!;
    expect((await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { closesAt: "ontem" }, cookie)).status).toBe(422);
  });

  it("o questionário publica as oito perguntas e a introdução fixa", async () => {
    const r = await chamar(lab.base, "GET", `/api/public/surveys/${publicId}`);
    expect(r.json.survey.status).toBe("aberta");
    expect(r.json.survey.questions).toHaveLength(8);
    expect(r.json.survey.intro).toMatch(/NUPE/);
    // A abertura conta visita agregada, sem identificador.
    expect(lab.store.data.visits.at(-1)!.count).toBeGreaterThan(0);
  });

  async function prova(sessionId: string) {
    const r = await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId });
    expect(r.status).toBe(200);
    return r.json.proof as string;
  }

  const sessao = (n: string) => `sess-${n}-${"x".repeat(30)}`;

  it("recusa envio sem prova anti-repetição", async () => {
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, { sessionId: sessao("a"), answers: RESPOSTAS_ESTUDANTE });
    expect(r.status).toBe(400);
  });

  it("recusa sessão curta", async () => {
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, { sessionId: "curta", answers: RESPOSTAS_ESTUDANTE });
    expect(r.status).toBe(400);
  });

  it("aponta pergunta obrigatória vazia", async () => {
    const sessionId = sessao("b");
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
      sessionId,
      proof: await prova(sessionId),
      answers: { ...RESPOSTAS_ESTUDANTE, e3: "" },
    });
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(/pergunta 3/i);
  });

  it("grava a resposta e não guarda identificação", async () => {
    const sessionId = sessao("c");
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
      sessionId,
      proof: await prova(sessionId),
      answers: RESPOSTAS_ESTUDANTE,
    });
    expect(r.status).toBe(201);
    const entrada = lab.store.data.entries.at(-1)!;
    const bruto = JSON.stringify(entrada);
    expect(bruto).not.toMatch(/sess-|127\.0\.0\.1/);
    expect(Object.keys(entrada).sort()).toEqual(["answers", "collectionId", "id", "submittedAt"]);
    const aberta = lab.store.data.openResponses.at(-1)!;
    expect(aberta.text).toContain("canal no WhatsApp");
    expect(aberta.themeIds).toContain("comunicacao");
  });

  it("o mesmo aparelho não responde duas vezes", async () => {
    const sessionId = sessao("c");
    // A prova já é recusada: a pessoa é avisada antes de preencher tudo de novo.
    const nova = await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId });
    expect(nova.status).toBe(409);
    // E o envio direto, com a prova que ele guardou, também não passa.
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
      sessionId,
      proof: "",
      answers: RESPOSTAS_ESTUDANTE,
    });
    expect(r.status).not.toBe(201);
    const c = lab.store.data.collections.find((x) => x.publicId === publicId)!;
    expect(lab.store.data.entries.filter((e) => e.collectionId === c.id)).toHaveLength(1);
  });

  it("o recibo responde pelo aparelho, sem guardar o identificador", async () => {
    // Antes de responder: pela prova (que não conta como resposta).
    const nova = sessao("recibo");
    expect((await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId: nova })).status).toBe(200);
    expect(
      (await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/recibo`, { sessionId: nova })).json.respondido,
    ).toBe(false);
    // Depois de responder: sim.
    expect(
      (await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/recibo`, { sessionId: sessao("c") })).json.respondido,
    ).toBe(true);
    // O registro guarda hash, não o identificador do aparelho.
    const c = lab.store.data.collections.find((x) => x.publicId === publicId)!;
    expect(lab.store.data.contest[c.id]!.every((x) => !x.sessionId.startsWith("sess-"))).toBe(true);
  });

  it("coleta encerrada recusa novos envios", async () => {
    const c = lab.store.data.collections.find((x) => x.audience === "estudantes")!;
    expect((await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { status: "encerrada" }, cookie)).status).toBe(200);
    const sessionId = sessao("d");
    const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
      sessionId,
      proof: await prova(sessionId).catch(() => ""),
      answers: RESPOSTAS_ESTUDANTE,
    });
    expect([400, 409]).toContain(r.status);
    const pagina = await chamar(lab.base, "GET", `/api/public/surveys/${publicId}`);
    expect(pagina.json.survey.status).toBe("encerrada");
  });

  it("resultados agregam a resposta recebida", async () => {
    const r = await chamar(lab.base, "GET", "/api/results/estudantes", undefined, cookie);
    expect(r.status).toBe(200);
    expect(r.json.summary.total).toBe(1);
    expect(r.json.summary.showPercent).toBe(false);
    expect(r.json.openResponses).toHaveLength(1);
    expect(r.json.themes.some((t: any) => t.id === "comunicacao")).toBe(true);
  });

  it("o estagiário corrige o tema de uma resposta aberta", async () => {
    const id = lab.store.data.openResponses[0]!.id;
    expect((await chamar(lab.base, "PUT", `/api/open-responses/${id}/theme`, { themeId: "inexistente" }, cookie)).status).toBe(422);
    expect((await chamar(lab.base, "PUT", `/api/open-responses/${id}/theme`, { themeId: "capacitacao" }, cookie)).status).toBe(200);
    const r = await chamar(lab.base, "GET", "/api/results/estudantes", undefined, cookie);
    expect(r.json.openResponses[0].themeIds).toEqual(["capacitacao"]);
    expect(r.json.openResponses[0].manual).toBe(true);
  });

  it("rotas internas continuam fechadas sem sessão", async () => {
    for (const rota of ["/api/results/docentes", "/api/records", "/api/report", "/api/dashboard"]) {
      expect((await chamar(lab.base, "GET", rota)).status).toBe(401);
    }
  });

  it("a página inteira não vaza nada sem sessão, mas o servidor entrega estático", async () => {
    const r = await chamar(lab.base, "GET", "/api/relatorio");
    expect(r.status).toBe(404);
  });
});

describe("fichas, matrizes e relatório", () => {
  let lab: Laboratorio;
  let cookie: string;

  beforeAll(async () => {
    lab = await laboratorio();
    await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL, password: SENHA });
    cookie = await entrar(lab.base);
  });

  it("grava a ficha 1 e relê", async () => {
    const r = await chamar(
      lab.base,
      "PUT",
      "/api/records/institution",
      { fields: { missao: "Apoiar pesquisa e extensão", visao: "[preencher]" }, numbers: [{ indicator: "Bolsistas", value: 12, source: "2026" }] },
      cookie,
    );
    expect(r.status).toBe(200);
    const dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.institution.fields.missao).toBe("Apoiar pesquisa e extensão");
    expect(dados.json.institution.numbers[0]).toMatchObject({ indicator: "Bolsistas", value: "12", source: "2026" });
    expect(typeof dados.json.institution.numbers[0].id).toBe("string");
  });

  it("versão de gravação: recusa lote velho, aceita navegador novo e publica a contagem", async () => {
    const salvar = (corpo: Record<string, unknown>) => chamar(lab.base, "PUT", "/api/records/diary", corpo, cookie);
    // Duas abas: a primeira grava com versão 3, a segunda ainda está na 1.
    expect((await salvar({ rows: [{ id: "a", date: "", observation: "primeira", source: "", question: "" }], versao: 3 })).status).toBe(200);
    const velha = await salvar({ rows: [{ id: "b", date: "", observation: "velha", source: "", question: "" }], versao: 2 });
    expect(velha.status).toBe(200);
    expect(velha.json).toMatchObject({ ok: true, ignorado: true, versao: 3 });
    // Versão 1 num servidor que já gravou é navegador novo: em vez de descartar
    // em silêncio, devolve 409 com a versão atual para o cliente reenviar.
    const nova = await salvar({ rows: [{ id: "c", date: "", observation: "nova", source: "", question: "" }], versao: 1 });
    expect(nova.status).toBe(409);
    expect(nova.json.versao).toBe(3);
    // A leitura publica a última versão: o contador do navegador parte dela.
    const lida = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(lida.json.recordVersions.diary).toBe(3);
    expect(lida.json.diary.map((r: any) => r.observation)).toEqual(["primeira"]);
  });

  it("guarda só os campos conhecidos das matrizes", async () => {
    const corpo = {
      porter: { clientes: [{ id: "a", text: "Estudantes", evidence: "ficha 1" }] },
      swot: { forcas: [{ id: "f", text: "Equipe próxima" }] },
      gut: [{ id: "g", text: "Prazos", gravity: 5, urgency: 4, tendency: 4 }],
      lixo: "não deveria ficar",
    };
    expect((await chamar(lab.base, "PUT", "/api/records/matrices", corpo, cookie)).status).toBe(200);
    const dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.matrices.porter.clientes).toHaveLength(1);
    expect(dados.json.matrices.porter.fornecedores).toEqual([]);
    expect(dados.json.matrices).not.toHaveProperty("lixo");
    expect(dados.json.matrices.gut[0]).toMatchObject({ gravity: 5, urgency: 4, tendency: 4 });
  });

  it("desfaz a edição de uma linha e refaz, sem perder a lista", async () => {
    const salvar = (linha: Record<string, string>) =>
      chamar(lab.base, "PUT", "/api/records/diary", { rows: [{ id: "linha-1", date: "", observation: "", source: "", question: "", ...linha }] }, cookie);
    const primeira = await salvar({ observation: "texto certo" });
    expect(primeira.status).toBe(200);
    expect(primeira.json.copias).toMatchObject({ "diary:linha:linha-1": true });
    // Clique errado troca o texto: o servidor guarda o anterior.
    const segunda = await salvar({ observation: "texto errado" });
    expect(segunda.status).toBe(200);
    const chave = encodeURIComponent("diary:linha:linha-1");
    expect((await chamar(lab.base, "POST", `/api/history/${chave}/restore`, {}, cookie)).status).toBe(200);
    let dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.diary.map((r: any) => r.observation)).toEqual(["texto certo"]);
    // Desfazer a volta atrás devolve a alteração: o botão não é de mão única.
    expect((await chamar(lab.base, "POST", `/api/history/${chave}/restore`, {}, cookie)).status).toBe(200);
    dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.diary.map((r: any) => r.observation)).toEqual(["texto errado"]);
  });

  it("remove uma linha e devolve com o conteúdo inteiro", async () => {
    const r = await chamar(
      lab.base,
      "PUT",
      "/api/records/glossary",
      { rows: [{ id: "v-1", acronym: "CEPE", meaning: "Conselho de Ensino", source: "site do NUPE" }] },
      cookie,
    );
    expect(r.status).toBe(200);
    expect((await chamar(lab.base, "PUT", "/api/records/glossary", { rows: [] }, cookie)).status).toBe(200);
    const vazio = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(vazio.json.glossary).toEqual([]);
    const chave = encodeURIComponent("glossary:linha:v-1");
    expect((await chamar(lab.base, "POST", `/api/history/${chave}/restore`, {}, cookie)).status).toBe(200);
    const dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.glossary).toHaveLength(1);
    expect(dados.json.glossary[0]).toMatchObject({ acronym: "CEPE", meaning: "Conselho de Ensino" });
  });

  it("desfaz campo da ficha 1 e da ficha 6", async () => {
    const salvar = (corpo: Record<string, unknown>) => chamar(lab.base, "PUT", "/api/records/institution", corpo, cookie);
    await salvar({ fields: { missao: "primeira missão" } });
    await salvar({ fields: { missao: "missão errada" } });
    const chave = encodeURIComponent("institution:campo:missao");
    expect((await chamar(lab.base, "POST", `/api/history/${chave}/restore`, {}, cookie)).status).toBe(200);
    let dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.institution.fields.missao).toBe("primeira missão");

    const f6 = (idea: string) => chamar(lab.base, "PUT", "/api/records/improvement", { idea, fiveW2H: {}, pdca: {} }, cookie);
    await f6("ideia boa");
    await f6("ideia errada");
    const chave6 = encodeURIComponent("improvement:campo:idea");
    expect((await chamar(lab.base, "POST", `/api/history/${chave6}/restore`, {}, cookie)).status).toBe(200);
    dados = await chamar(lab.base, "GET", "/api/records", undefined, cookie);
    expect(dados.json.improvement.idea).toBe("ideia boa");
  });

  it("não oferece desfazer para gravação velha que o servidor ignorou", async () => {
    await chamar(lab.base, "PUT", "/api/records/diary", { rows: [{ id: "v-1", date: "", observation: "nova", source: "", question: "" }], versao: 9 }, cookie);
    const velha = await chamar(lab.base, "PUT", "/api/records/diary", { rows: [{ id: "v-1", date: "", observation: "antiga", source: "", question: "" }], versao: 2 }, cookie);
    expect(velha.status).toBe(200);
    expect(velha.json.ignorado).toBe(true);
    expect(velha.json.copias ?? {}).not.toHaveProperty("diary:linha:v-1");
  });

  it("cria fluxo a partir do modelo da bolsa de monitoria", async () => {
    const r = await chamar(lab.base, "POST", "/api/records/flows", { templateId: "bolsa-monitoria" }, cookie);
    expect(r.status).toBe(200);
    expect(r.json.flow.steps.length).toBe(5);
    expect(r.json.flow.steps[2].docSystem).toBe("SISPROEX");
    expect(r.json.flow.name).toMatch(/\(1\)$/);
    const vazio = await chamar(lab.base, "POST", "/api/records/flows", {}, cookie);
    expect(vazio.json.flow.steps).toHaveLength(1);
    expect(vazio.json.flow.name).toBe("Fluxo 2");
  });

  it("recusa tipo de ficha desconhecido", async () => {
    expect((await chamar(lab.base, "PUT", "/api/records/qualquer", {}, cookie)).status).toBe(404);
  });

  it("relatório traz as nove seções e lista o que falta", async () => {
    const r = await chamar(lab.base, "GET", "/api/report", undefined, cookie);
    expect(r.status).toBe(200);
    const numeradas = r.json.report.sections.filter((s: any) => /^\d\.\s/.test(s.title));
    expect(numeradas).toHaveLength(9);
    expect(r.json.report.status).toBe("incompleto");
    expect(r.json.report.missing.some((m: any) => m.field === "Missão")).toBe(false);
    expect(r.json.report.missing.some((m: any) => m.field === "Visão")).toBe(true);
  });

  it("versão de impressão responde em HTML com CSP própria", async () => {
    const res = await fetch(lab.base + "/api/report/document", { headers: { "x-nupe-client": "web", cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    const html = await res.text();
    expect(html).toContain("Relatório de diagnóstico do NUPE");
    expect(html).toContain("Prazos");
  });

  it("demonstração entra marcada como fictícia e sai inteira", async () => {
    expect((await chamar(lab.base, "POST", "/api/demo/seed", {}, cookie)).status).toBe(200);
    let dash = await chamar(lab.base, "GET", "/api/dashboard", undefined, cookie);
    expect(dash.json.demo).toMatch(/fictíci/);
    expect(dash.json.collections.filter((c: any) => c.demo)).toHaveLength(3);
    const textos = lab.store.data.openResponses.map((r) => r.text);
    expect(textos.every((t) => t.includes("(fictício)"))).toBe(true);
    expect((await chamar(lab.base, "POST", "/api/demo/clear", {}, cookie)).status).toBe(200);
    dash = await chamar(lab.base, "GET", "/api/dashboard", undefined, cookie);
    expect(dash.json.demo).toBeNull();
    expect(dash.json.collections.some((c: any) => c.demo)).toBe(false);
    expect(dash.json.counts.every((c: any) => c.total === 0)).toBe(true);
    expect(lab.store.data.openResponses).toHaveLength(0);
  });

  it("a demonstração não contamina o relatório depois de removida", async () => {
    const r = await chamar(lab.base, "GET", "/api/report", undefined, cookie);
    expect(r.json.report.sections[0].paras[0].text).toContain("Foram recebidas 0 respostas");
  });

  it("os ajustes gravam só os campos conhecidos e recusam período invertido", async () => {
    const antes = lab.store.data.settings;
    const r = await chamar(
      lab.base,
      "PUT",
      "/api/records/settings",
      { displayName: "Núcleo de Pesquisa e Extensão", supervisor: "Coordenação", extra: "não deveria entrar" },
      cookie,
    );
    expect(r.status).toBe(200);
    const depois = lab.store.data.settings;
    expect(depois.displayName).toBe("Núcleo de Pesquisa e Extensão");
    expect(depois.supervisor).toBe("Coordenação");
    expect(depois).not.toHaveProperty("extra");
    expect(depois.course).toBe(antes.course);
    const invertido = await chamar(lab.base, "PUT", "/api/records/settings", { startDate: "2026-08-01", endDate: "2026-07-01" }, cookie);
    expect(invertido.status).toBe(422);
    expect(lab.store.data.settings.startDate).not.toBe("2026-08-01");
  });

  it("os dados fictícios só entram e saem com o cabeçalho do painel", async () => {
    const semCabecalho = await fetch(lab.base + "/api/demo/seed", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nupe-client": "outro", origin: lab.base, cookie },
      body: "{}",
    });
    expect(semCabecalho.status).toBe(403);
    expect(lab.store.data.demo).toBeNull();
  });
});

describe("limites de acesso", () => {
  it("bloqueia força bruta depois de várias tentativas erradas", async () => {
    const lab = await laboratorio();
    await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL, password: SENHA });
    const codigos: number[] = [];
    for (let i = 0; i < 9; i++) codigos.push((await chamar(lab.base, "POST", "/api/login", { email: EMAIL, password: "errada" })).status);
    expect(codigos.filter((c) => c === 401)).toHaveLength(8);
    expect(codigos.at(-1)).toBe(429);
    // Mesmo com a senha certa, o limite continua valendo na janela.
    expect((await chamar(lab.base, "POST", "/api/login", { email: EMAIL, password: SENHA })).status).toBe(429);
  });

  it("o limite por rede dos ajustes vale já no próximo envio (0 desliga)", async () => {
    const lab = await laboratorio();
    await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL, password: SENHA });
    const cookie = await entrar(lab.base);
    const c = lab.store.data.collections.find((x) => x.audience === "docentes")!;
    const publicId = (await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { status: "aberta" }, cookie)).json.collection.publicId;
    expect((await chamar(lab.base, "PUT", "/api/records/settings", { rateLimitPerHour: 1 }, cookie)).status).toBe(200);
    const enviar = async (n: number) => {
      const sessionId = `docente-${n}-${"z".repeat(30)}`;
      await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId });
      const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
        sessionId,
        proof: (await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId })).json.proof,
        answers: { d1: "ambos", d2: ["spgu"], d3: 3, d4: "relatorio", d5: "as_vezes", d6: 3, d7: ["avisos"], d8: "Texto de teste." },
      });
      return r.status;
    };
    await enviar(1);
    expect(await enviar(2)).toBe(429);
    expect((await chamar(lab.base, "PUT", "/api/records/settings", { rateLimitPerHour: 0 }, cookie)).status).toBe(200);
    expect(await enviar(3)).toBe(201);
  });

  it("sala de aula atrás do mesmo IP: cada aparelho responde uma vez", async () => {
    const lab = await laboratorio();
    await chamar(lab.base, "POST", "/api/setup", { name: "Pessoa de Teste", email: EMAIL, password: SENHA });
    const cookie = await entrar(lab.base);
    const c = lab.store.data.collections.find((x) => x.audience === "estudantes")!;
    const aberta = await chamar(lab.base, "PATCH", `/api/collections/${c.id}`, { status: "aberta" }, cookie);
    const publicId = aberta.json.collection.publicId;
    const codigos: number[] = [];
    for (let i = 0; i < 12; i++) {
      const sessionId = `aluno-${i}-${"y".repeat(30)}`;
      const prova = await chamar(lab.base, "POST", "/api/public/surveys/contest", { collectionPublicId: publicId, sessionId });
      const r = await chamar(lab.base, "POST", `/api/public/surveys/${publicId}/responses`, {
        sessionId,
        proof: prova.json.proof,
        answers: RESPOSTAS_ESTUDANTE,
      });
      codigos.push(r.status);
    }
    expect(codigos.every((c) => c === 201)).toBe(true);
  });
});
