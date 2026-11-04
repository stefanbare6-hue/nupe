// Confere o PDF exportado: tamanho, páginas e se o fecho aparece no texto.
// Uso: node scripts/pdf-checa.mjs [saída.pdf]
import { chromium } from "playwright";
import { readFileSync, statSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3333";
const saida = process.argv[3] ?? "capturas/relatorio.pdf";

const browser = await chromium.launch();
const ctx = await browser.newContext();
const login = await ctx.request.post(`${base}/api/login`, {
  headers: { "x-nupe-client": "web" },
  data: { email: "maria@exemplo.br", password: "senha-teste-123" },
});
if (!login.ok()) throw new Error(`login falhou: ${login.status()}`);
const p = await ctx.newPage();
await p.goto(`${base}/api/report/document`);
await p.waitForSelector("footer.pe");
const texto = await p.locator("footer.pe").innerText();
await p.emulateMedia({ media: "print" });
await p.pdf({ path: saida, format: "A4", printBackground: true });
const bytes = readFileSync(saida);
const paginas = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
await browser.close();

if (!/Fim do relatório/.test(texto)) throw new Error("fecho ausente no documento");
if (statSync(saida).size < 50_000) throw new Error("PDF pequeno demais");
console.log(`ok  ${saida}  ${paginas} página(s), ${Math.round(bytes.length / 1024)} KB`);
