import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./db";
import { buildApp } from "./app";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_PATH = process.env.NUPE_DATA ? resolve(process.env.NUPE_DATA) : join(process.cwd(), "data", "nupe.json");
const SECRET = process.env.NUPE_SECRET || "dev-secret-troque-em-producao";
const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || "0.0.0.0";

// Interface compilada. O caminho relativo ao arquivo cobre o layout do
// repositório; se o servidor foi copiado sozinho para outro lado, procura
// também a partir da pasta em que foi iniciado.
function acharInterface(): string | null {
  const candidatos = [
    process.env.NUPE_WEB_DIST ? resolve(process.env.NUPE_WEB_DIST) : null,
    join(__dirname, "../../web/dist"),
    join(process.cwd(), "apps/web/dist"),
    join(process.cwd(), "web/dist"),
    join(process.cwd(), "dist"),
  ].filter((x): x is string => Boolean(x));
  for (const c of candidatos) if (existsSync(join(c, "index.html"))) return c;
  return null;
}
const WEB_DIST = acharInterface();

if (!WEB_DIST) {
  console.warn("[NUPE] Interface compilada não encontrada: rode `npm run build` ou defina NUPE_WEB_DIST.");
}
if (SECRET === "dev-secret-troque-em-producao") {
  console.warn("[NUPE] NUPE_SECRET não foi definido: as sessões e o controle anti-repetição usam a chave padrão.");
}

const store = await Store.open(DATA_PATH);
const app = await buildApp({ store, secret: SECRET, webDist: WEB_DIST });

// Aviso de primeiro acesso: a tela de configuração aparece quando não há administrador.
if (!store.data.admin) {
  app.log.info("Nenhum administrador cadastrado: abra a interface e conclua a configuração inicial.");
}

const shutdown = async () => {
  await store.close();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: PORT, host: HOST });
// O log precisa dizer em que porta e em que arquivo o app ficou: é por essas
// duas linhas que se descobre um domínio apontando para a porta errada.
app.log.info({ porta: PORT, host: HOST, dataPath: DATA_PATH, gravavel: store.gravaNoDisco }, "NUPE API pronta");
