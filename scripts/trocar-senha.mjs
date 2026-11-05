// Redefine a senha do acesso de desenvolvimento de maria@exemplo.br.
// Uso: node scripts/trocar-senha.mjs [novaSenha] [base]
// Segredo ao lado no arquivo .env da raiz (NUPE_DEV_PASSWORD).
import { readFileSync, existsSync } from "node:fs";

const base = process.argv[3] ?? "http://localhost:3333";
const arquivoEnv = "E:/nupe/.env";
const linha = existsSync(arquivoEnv)
  ? readFileSync(arquivoEnv, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("NUPE_DEV_PASSWORD="))
  : "";
const senha = process.argv[2] ?? (linha ? linha.slice("NUPE_DEV_PASSWORD=".length).trim() : "");
if (!senha || senha.length < 8) {
  console.error("sem NUPE_DEV_PASSWORD no .env (mínimo de 8 caracteres)");
  process.exit(1);
}

const r = await fetch(`${base}/api/dev/reset-password`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-nupe-client": "web", origin: base },
  body: JSON.stringify({ email: "maria@exemplo.br", password: senha }),
});
const texto = await r.text();
if (!r.ok) {
  console.error(r.status, texto);
  process.exit(1);
}
console.log("senha de desenvolvimento redefinida");
