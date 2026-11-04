// Reinicia o servidor de desenvolvimento com os dados de trabalho.
import { execSync, spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const script = `
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*apps/api/dist/server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
`;
writeFileSync("C:/Users/maria/AppData/Local/Temp/opencode/parar.ps1", script, "utf8");
try {
  execSync("powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/maria/AppData/Local/Temp/opencode/parar.ps1", { stdio: "ignore" });
} catch {}
await new Promise((r) => setTimeout(r, 800));
const p = spawn(process.execPath, ["apps/api/dist/server.js"], {
  cwd: "E:/nupe",
  env: { ...process.env, NUPE_DATA: "E:/nupe/data/dev.json" },
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
