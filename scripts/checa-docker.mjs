// Reproduz os passos do Dockerfile num diretório limpo: copia só o que a
// imagem de build usa, roda npm ci e o build, e confere que o servidor sobe
// com apenas as pastas dist. Não substitui o docker build, mas pega erro de
// script, arquivo fora do pacote e caminho relativo quebrado.
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origem = process.cwd();
const destino = mkdtempSync(join(tmpdir(), "nupe-docker-"));
const copiar = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/core/package.json",
];
const pastas = ["apps/api/src", "apps/web/src", "apps/web/public", "packages/core/src"];

console.log("cópia limpa em", destino);
for (const f of copiar) {
  mkdirSync(join(destino, f, ".."), { recursive: true });
  cpSync(join(origem, f), join(destino, f));
}
for (const p of pastas) cpSync(join(origem, p), join(destino, p), { recursive: true });
// Vite precisa do index.html e das configs locais do pacote web.
for (const f of ["apps/web/index.html", "apps/web/vite.config.ts", "apps/web/tsconfig.json", "apps/api/tsconfig.json", "packages/core/tsconfig.json"]) {
  if (existsSync(join(origem, f))) {
    mkdirSync(join(destino, f, ".."), { recursive: true });
    cpSync(join(origem, f), join(destino, f));
  }
}

execSync("npm ci --no-audit --no-fund", { cwd: destino, stdio: "inherit" });
execSync("npm run build", { cwd: destino, stdio: "inherit" });

for (const p of ["apps/api/dist/server.js", "apps/web/dist/index.html", "packages/core/dist/index.js"]) {
  if (!existsSync(join(destino, p))) throw new Error(`falta ${p} depois do build`);
}

// Sobe o servidor como a imagem faria: só o dist e a pasta de dados.
const dados = join(destino, "dados", "nupe.json");
const porta = 3400 + Math.floor(Math.random() * 200);
const filho = spawn(process.execPath, ["apps/api/dist/server.js"], {
  cwd: destino,
  env: { ...process.env, PORT: String(porta), HOST: "127.0.0.1", NUPE_DATA: dados, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let saida = "";
filho.stdout.on("data", (d) => (saida += d));
filho.stderr.on("data", (d) => (saida += d));

let ok = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const tela = await fetch(`http://127.0.0.1:${porta}/entrar`);
    const html = await tela.text();
    const saude = await fetch(`http://127.0.0.1:${porta}/api/health`);
    if (tela.ok && html.includes('id="raiz"') && saude.ok) {
      ok = true;
      break;
    }
  } catch {}
}
filho.kill();
if (!ok) throw new Error(`servidor não respondeu como esperado:\n${saida}`);
if (!existsSync(dados)) throw new Error("o servidor não gravou o arquivo de dados");
console.log("ok  build limpo e servidor da imagem respondem");
// No Windows o processo recém-encerrado ainda segura arquivos por instantes;
// a limpeza da pasta temporária não pode derrubar a checagem.
try {
  rmSync(destino, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch {
  console.log(`(pasta temporária não removida: ${destino})`);
}
