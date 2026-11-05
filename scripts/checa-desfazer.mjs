// Verificação do "Desfazer" numa sessão real de navegador.
// Uso: node scripts/checa-desfazer.mjs [base]
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3333";
const saida = "capturas/desfazer";
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Guarda o login entre verificações: o limite de tentativas é 8 a cada 10 min.
const sessao = "scripts/.sessao.json";
if (existsSync(sessao)) {
  try {
    await ctx.addCookies(JSON.parse(readFileSync(sessao, "utf8")));
  } catch {}
}
const page = await ctx.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // 401 de /api/me antes do login é o esperado: a área interna confere a sessão
  // e manda para /entrar. Qualquer outro erro conta.
  if (m.type() === "error" && !/401/.test(m.text()) && !m.text().includes("/api/me")) erros.push(`console: ${m.text()}`);
});

const falhas = [];
const ok = (nome) => console.log(`ok   ${nome}`);
const falha = (nome) => {
  falhas.push(nome);
  console.log(`FALHA ${nome}`);
};

await page.goto(`${base}/entrar`);
// Só entra quando não houver sessão guardada; do contrário o /entrar já vai direto ao painel.
if (await page.getByLabel("E-mail").count()) {
  await page.getByLabel("E-mail").fill("maria@exemplo.br");
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: /entrar/i }).click();
}
await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
writeFileSync(sessao, JSON.stringify(await ctx.cookies()), "utf8");
ok("login");

// Ficha 7 (diário): cria um registro, grava, edita e desfaz.
await page.goto(`${base}/fichas/7`);
await page.waitForTimeout(900);
const adicionar = page.getByRole("button", { name: /Adicionar registro/i });
if ((await page.getByLabel(/registro \d+, O que observei/).count()) === 0) {
  await adicionar.first().click();
  await page.waitForTimeout(1400);
}
const observacao = page.getByLabel(/registro \d+, O que observei/);
const antes = await observacao.count();
ok(`diário com ${antes} registro(s)`);

await observacao.first().fill(`registro ${Date.now()}`);
await observacao.first().blur();
await page.waitForTimeout(1200);

const desfazer = page.getByRole("button", { name: /Desfazer a última alteração de o registro 1/ });
if (await desfazer.count()) ok("botão Desfazer aparece depois de gravar");
else falha("botão Desfazer aparece depois de gravar");

if (await desfazer.count()) {
  await desfazer.first().click();
  await page.waitForTimeout(1600);
  const depois = await observacao.count();
  const valor = depois ? await observacao.first().inputValue() : "(linha removida)";
  if (depois === antes && valor !== `registro`) ok(`desfazer voltou o registro 1 (linhas ${antes} -> ${depois}, texto "${valor}")`);
  else falha(`desfazer devolveu "${valor}" (linhas ${antes} -> ${depois})`);
}

// Ficha 1: campo de texto.
await page.goto(`${base}/fichas/1`);
await page.waitForTimeout(900);
const missao = page.getByLabel(/Missão/).first();
const missaoAntes = await missao.inputValue();
await missao.fill(`missão ${Date.now()}`);
await missao.blur();
await page.waitForTimeout(1000);
const undo1 = page.getByRole("button", { name: /Desfazer a última alteração de Missão/ });
if (await undo1.count()) {
  await undo1.first().click();
  await page.waitForTimeout(1600);
  const missaoDepois = await page.getByLabel(/Missão/).first().inputValue();
  if (missaoDepois === missaoAntes) ok("Desfazer devolve o texto anterior da missão");
  else falha(`missão ficou "${missaoDepois}", era "${missaoAntes}"`);
} else falha("Desfazer no campo da ficha 1");

// Matrizes: um item da matriz de Porter.
await page.goto(`${base}/matrizes`);
await page.waitForTimeout(900);
const itemPorter = page.getByLabel(/Clientes, item 1/).first();
if ((await itemPorter.count()) === 0) {
  await page.getByRole("button", { name: /Adicionar item/i }).first().click();
  await page.waitForTimeout(1400);
}
const porterAntes = await itemPorter.inputValue();
await itemPorter.fill(`cliente ${Date.now()}`);
await itemPorter.blur();
await page.waitForTimeout(1000);
const undoM = page.getByRole("button", { name: /Desfazer a última alteração de Clientes, item 1/ });
if (await undoM.count()) {
  await undoM.first().click();
  await page.waitForTimeout(1600);
  const porterDepois = await page.getByLabel(/Clientes, item 1/).first().inputValue();
  if (porterDepois === porterAntes) ok("Desfazer devolve o item da matriz");
  else falha(`item da matriz ficou "${porterDepois}", era "${porterAntes}"`);
} else falha("Desfazer no item da matriz");
await page.screenshot({ path: `${saida}/matrizes-1440.png` });

// Questionário público numa sessão nova (sem recibo).
const outro = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await outro.newPage();
await p2.goto(`${base}/e/fV0Nn2y_TKjYJVnqh9hqSA`);
await p2.waitForTimeout(1500);
const titulo = await p2.title();
const textoPagina = await p2.locator("body").innerText();
if (!/já respondeu/i.test(textoPagina)) ok(`questionário abre para responder (${titulo})`);
else falha("questionário novo já aparece como respondido");
await p2.screenshot({ path: `${saida}/questionario-1440.png` });
await outro.close();

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/fichas/7`);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${saida}/ficha7-390.png` });

console.log(erros.length ? `erros de página:\n${erros.join("\n")}` : "sem erros de página em console");
await browser.close();
console.log(falhas.length ? `\n${falhas.length} falha(s)` : "\ntudo certo");
process.exit(falhas.length || erros.length ? 1 : 0);
