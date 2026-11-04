// Simula a função serverless da Vercel: importa api/index.ts e envia um GET e
// um POST pelo objeto Request/Response cru, como a plataforma faz.
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NUPE_DATA = join(mkdtempSync(join(tmpdir(), "nupe-vercel-")), "nupe.json");
const { default: handler } = await import("../api/index.ts");

const srv = createServer((req, res) => handler(req, res));
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;

const checagens = [];
const tela = await fetch(`${base}/entrar`);
const corpo = await tela.text();
checagens.push(["página /entrar", tela.ok && /<div id="raiz"/.test(corpo), tela.status]);
const api = await fetch(`${base}/api/health`);
checagens.push(["api /api/health", api.ok && (await api.json()).ok === true, api.status]);
const setup = await fetch(`${base}/api/setup/status`);
const status = await setup.json();
checagens.push(["setup precisa de configuração", setup.ok && status.needsSetup === true, JSON.stringify(status)]);
const asset = corpo.match(/\/assets\/[^"]+\.js/);
if (asset) {
  const a = await fetch(`${base}${asset[0]}`);
  checagens.push(["arquivo estático", a.ok && /javascript/.test(a.headers.get("content-type") ?? ""), a.status]);
}
const faltando = await fetch(`${base}/assets/nao-existe.js`);
checagens.push(["arquivo inexistente responde 404", faltando.status === 404, faltando.status]);

srv.close();
let falhas = 0;
for (const [nome, ok, detalhe] of checagens) {
  if (!ok) falhas++;
  console.log(`${ok ? "ok     " : "FALHOU "} ${nome} (${detalhe})`);
}
console.log(`\n${checagens.length - falhas} de ${checagens.length} passaram`);
process.exit(falhas ? 1 : 0);
