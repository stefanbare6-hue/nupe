// Smoke test da API (executar com o servidor de pé em http://localhost:3333 e dados descartáveis).
const base = process.env.BASE ?? "http://localhost:3333";
const H = { "content-type": "application/json", "x-nupe-client": "web", origin: base };
let cookies = "";
function jar(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (v === "" || /expires=thu, 01 jan 1970/i.test(c)) {
      cookies = cookies.split("; ").filter((x) => !x.startsWith(k + "=")).join("; ");
    } else {
      const rest = cookies.split("; ").filter((x) => !x.startsWith(k + "="));
      rest.push(`${k}=${v}`);
      cookies = rest.join("; ");
    }
  }
}
async function call(method, path, body, extra = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...H, ...(cookies ? { cookie: cookies } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar(res);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const out = [];
const check = (name, cond, extra) => out.push({ name, ok: Boolean(cond), extra });

const setup = await call("GET", "/api/setup/status");
check("setup status", setup.status === 200 && setup.json.needsSetup === true, setup.json);

const cfg = await call("POST", "/api/setup", { name: "Teste", email: "teste@exemplo.br", password: "senha12345" });
check("setup cria admin", cfg.status === 200, cfg);

const me = await call("GET", "/api/me");
check("sessão autenticada", me.status === 200 && me.json.name === "Teste");

const seed = await call("POST", "/api/demo/seed", {});
check("seed demo", seed.status === 200, seed);

const dash = await call("GET", "/api/dashboard");
check("dashboard contagens", dash.status === 200 && dash.json.counts.length === 3, dash.json?.counts);
check("docentes amostra pequena (6 respostas)", dash.json?.counts?.find((c) => c.audience === "docentes")?.total === 6);

const resDoc = await call("GET", "/api/results/docentes");
check("resultados docentes", resDoc.status === 200 && resDoc.json.summary.total === 6, resDoc.json?.summary?.total);
const d3 = resDoc.json.summary.questions.find((q) => q.questionId === "d3");
check("média escala d3 calculada", typeof d3?.scale?.mean === "number", d3?.scale);
const resEquipe = await call("GET", "/api/results/equipe");
check("equipe abaixo de 5 → sem percentuais", resEquipe.json.summary.showPercent === false && resEquipe.json.summary.questions.every((q) => q.options.every((o) => o.percent === null)));

const report = await call("GET", "/api/report");
check("relatório tem 9 seções", report.status === 200 && report.json.report.sections.length >= 9, report.json?.report?.sections?.map((s) => s.id));
check("relatório lista faltantes", report.json.report.missing.length > 0, report.json?.report?.missing?.length);

// Fluxo público
const cols = await call("GET", "/api/dashboard");
const est = cols.json.collections.find((c) => c.audience === "estudantes" && !c.demo);
check("coleta sem publicId até abrir", est && est.publicId === null, est);
const opened = await call("PATCH", `/api/collections/${est.id}`, { status: "aberta" });
check("abre coleta e gera link", opened.status === 200 && opened.json.collection.publicId, opened.json);

const pub = await fetch(`${base}/api/public/surveys/${opened.json.collection.publicId}`).then((r) => r.json());
check("link público mostra questionário", pub.survey?.status === "aberta" && pub.survey.questions.length === 8);

// Envio: sessão + prova
const sid = "sessao-teste-" + "a".repeat(20);
const proofRes = await call("POST", "/api/public/surveys/contest", { collectionPublicId: opened.json.collection.publicId, sessionId: sid });
check("gera prova", proofRes.status === 200 && proofRes.json.proof, proofRes);
const answers = {
  e1: "letras",
  e2: ["extensao"],
  e3: "em_parte",
  e4: ["grupos", "professores"],
  e5: ["falta_tempo"],
  e6: 3,
  e7: "sim",
  e8: "Sugestão de teste fictícia sobre WhatsApp.",
};
const bad = await call("POST", `/api/public/surveys/${opened.json.collection.publicId}/responses`, { sessionId: sid, proof: proofRes.json.proof, answers: { e1: "x" } });
check("rejeita envio incompleto", bad.status === 422, bad.json);
const okSend = await call("POST", `/api/public/surveys/${opened.json.collection.publicId}/responses`, { sessionId: sid, proof: proofRes.json.proof, answers });
check("aceita envio anônimo", okSend.status === 201, okSend.json);
const proof2 = await call("POST", "/api/public/surveys/contest", { collectionPublicId: opened.json.collection.publicId, sessionId: sid });
const dup = await call("POST", `/api/public/surveys/${opened.json.collection.publicId}/responses`, { sessionId: sid, proof: proof2.json?.proof, answers });
check("bloqueia envio repetido", dup.status === 409, dup.json);

// CSRF
const noHeader = await fetch(`${base}/api/records/matrices`, { method: "PUT", headers: { "content-type": "application/json", cookie: cookies }, body: "{}" });
check("mutações sem cabeçalho recusadas", noHeader.status === 403);

// Fichas
const saveInst = await call("PUT", "/api/records/institution", { fields: { missao: "Teste" }, numbers: [{ id: "a", indicator: "Bolsistas", value: "10", source: "2026" }] });
check("salva ficha 1/2", saveInst.status === 200);
const recs = await call("GET", "/api/records");
check("recarrega ficha", recs.json.institution.fields.missao === "Teste" && recs.json.institution.numbers.length === 1);

// logout
const lo = await call("POST", "/api/logout", {});
const after = await call("GET", "/api/me");
check("logout encerra sessão", lo.status === 200 && after.status === 401);

console.log(JSON.stringify(out, null, 1));
const failed = out.filter((o) => !o.ok);
console.log(failed.length ? `FALHAS: ${failed.length}` : "TUDO OK");
process.exit(failed.length ? 1 : 0);
