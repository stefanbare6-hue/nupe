// Capturas de tela para revisão visual. Uso: node scripts/capturar.mjs http://localhost:3333 entrada-dados.json
// entrada-dados.json: { "email": "...", "senha": "...", "rotas": [{ "url": "/", "nome": "painel" }] }
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3333";
const cfg = JSON.parse(readFileSync(process.argv[3] ?? "capturas.json", "utf8"));
const saida = cfg.saida ?? "capturas";
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const erros = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

if (cfg.email) {
  await page.goto(`${base}/entrar`);
  await page.getByLabel("E-mail").fill(cfg.email);
  await page.getByLabel("Senha").fill(cfg.senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}

for (const r of cfg.rotas) {
  // Cada largura recarrega a página: a barra inferior fixa e a barra do topo só
  // aparecem na captura da dobra se a rolagem começar de novo do topo.
  for (const [largura, sufixo] of [
    [1440, "1440"],
    [768, "768"],
    [390, "390"],
  ]) {
    await page.setViewportSize({ width: largura, height: largura < 500 ? 844 : 900 });
    await page.goto(`${base}${r.url}`);
    if (r.espera) await page.waitForSelector(r.espera, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (r.acao) await page.evaluate(r.acao);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    // A dobra é capturada em 390px de altura para mostrar como a barra inferior
    // se sobrepõe ao conteúdo, sem esconder o problema numa imagem inteira.
    await page.screenshot({
      path: join(saida, `${r.nome}-${sufixo}.png`),
      fullPage: r.tela ? false : !(largura < 500 && cfg.dobra),
    });
  }
}
console.log(JSON.stringify({ erros: [...new Set(erros)] }, null, 1));
await browser.close();
