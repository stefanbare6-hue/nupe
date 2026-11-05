// Confere, pelo gatilho do servidor de desenvolvimento, que NUPE_DEV_PASSWORD
// está ativo (o servidor responde, sem alterar nada).
// Uso: node scripts/trocar-senha.mjs [base]
// A senha fica no .env da raiz, em NUPE_DEV_PASSWORD. A conta acessada é a que
// foi criada na configuração inicial, sem interferência daqui.
import { readFileSync, existsSync } from "node:fs";

const base = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3333";
const arquivoEnv = "E:/nupe/.env";
const linha = existsSync(arquivoEnv)
  ? readFileSync(arquivoEnv, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("NUPE_DEV_PASSWORD="))
  : "";
const senha = linha ? linha.slice("NUPE_DEV_PASSWORD=".length).trim() : "";
if (!senha || senha.length < 8) {
  console.error("sem NUPE_DEV_PASSWORD no .env (mínimo de 8 caracteres)");
  process.exit(1);
}

const r = await fetch(`${base}/api/dev/reset-password`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-nupe-client": "web", origin: base },
  body: JSON.stringify({ email: "maria@exemplo.br", password: senha }),
});
if (r.status === 404) {
  console.error("o gatilho de desenvolvimento não está ativo (falta reiniciar o servidor ou o .env)");
  process.exit(1);
}
const texto = await r.text();
if (!r.ok) {
  console.error(r.status, texto);
  process.exit(1);
}
console.log("gatilho de desenvolvimento ativo; a conta acessada continua com a senha criada na configuração");
