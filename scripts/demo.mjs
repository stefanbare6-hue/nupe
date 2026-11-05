// Carrega a demonstração (30 respostas por público + fichas) ou a remove.
// Uso: node scripts/demo.mjs [carregar|remover|verificar]
import { readFileSync } from "node:fs";

const base = process.argv[3] ?? "http://localhost:3333";
const acao = process.argv[2] === "remover" ? "clear" : process.argv[2] === "carregar" ? "seed" : "verificar";

const login = await fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-nupe-client": "web", origin: base },
  body: JSON.stringify({ email: "maria@exemplo.br", password: "senha-teste-123" }),
});
if (!login.ok) throw new Error(`login ${login.status}`);
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const headers = { "content-type": "application/json", "x-nupe-client": "web", origin: base, cookie };

if (acao !== "verificar") {
  const r = await fetch(`${base}/api/demo/${acao}`, { method: "POST", headers, body: "{}" });
  console.log(acao, r.status, (await r.text()).slice(0, 200));
}

const painel = await (await fetch(`${base}/api/dashboard`, { headers })).json();
const dados = JSON.parse(readFileSync("E:/nupe/data/dev.json", "utf8"));
for (const c of painel.collections) {
  const n = dados.entries.filter((e) => e.collectionId === c.id).length;
  const rotulo = c.demo ? `fictício: ${n} respostas` : `${c.status}${c.closesAt ? ` até ${c.closesAt.slice(0, 10)}` : ""}: ${n}`;
  console.log(`  ${c.audience.padEnd(10)} ${rotulo}`);
}
const rel = await (await fetch(`${base}/api/report`, { headers })).json();
console.log(`relatório: ${rel.report.sections.length} seções · ${rel.report.missing.length} campos a preencher`);
