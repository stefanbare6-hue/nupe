// Retrato da demonstração: painel, coletas, resultados das três coletas e relatório.
// Uso: node scripts/capturar-demo.mjs [base]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3333";
const saida = "capturas/demo";
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/401/.test(m.text()) && !m.text().includes("/api/me")) erros.push(`console: ${m.text()}`);
});

const foto = async (nome, cheia = true) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: cheia });
  console.log("foto", nome);
};

await page.goto(`${base}/entrar`);
await page.getByLabel("E-mail").fill("maria@exemplo.br");
await page.getByLabel("Senha").fill("senha-teste-123");
await page.getByRole("button", { name: /entrar/i }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));

await page.goto(`${base}/`);
await page.waitForTimeout(1600);
await foto("01-painel");

await page.goto(`${base}/coletas`);
await page.waitForTimeout(1200);
await foto("02-coletas");

for (const publico of ["docentes", "estudantes", "equipe"]) {
  await page.goto(`${base}/resultados/${publico}`);
  await page.waitForTimeout(1600);
  await foto(`03-resultados-${publico}`);
}

await page.goto(`${base}/relatorio`);
await page.waitForTimeout(2200);
await foto("04-relatorio");

// Telefone: resultados e relatório.
const telefone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  storageState: await desktop.storageState(),
});
const tp = await telefone.newPage();
for (const [rota, nome] of [
  ["/resultados/estudantes", "05-telefone-resultados"],
  ["/relatorio", "06-telefone-relatorio"],
]) {
  await tp.goto(base + rota);
  await tp.waitForTimeout(1600);
  await tp.screenshot({ path: `${saida}/${nome}.png` });
  console.log("foto", nome);
}

await browser.close();
if (erros.length) {
  console.log("ERROS:", erros.join("\n"));
  process.exit(1);
}
console.log("sem erros de página em console");
