// Reinicia o servidor de desenvolvimento lendo o .env da raiz.
// Uso: node scripts/reiniciar.mjs
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const raiz = "E:/nupe";
const arquivoEnv = `${raiz}/.env`;
const env = { ...process.env, NUPE_DATA: `${raiz}/data/dev.json` };
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) env[m[1]] = m[2];
  }
}

const script = `
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*apps/api/dist/server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
`;
const parar = "C:/Users/maria/AppData/Local/Temp/opencode/parar.ps1";
writeFileSync(parar, script, "utf8");
try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File ${parar}`, { stdio: "ignore" });
} catch {}
await new Promise((r) => setTimeout(r, 800));

const p = spawn(process.execPath, ["apps/api/dist/server.js"], {
  cwd: raiz,
  env,
  detached: true,
  stdio: "ignore",
});
p.unref();
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch("http://127.0.0.1:3333/api/public/health");
    if (res.ok) {
      console.log("servidor pronto");
      process.exit(0);
    }
  } catch {}
}
console.log("servidor não respondeu");
process.exit(1);
