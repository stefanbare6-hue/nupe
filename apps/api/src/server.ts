import { existsSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./db";
import { buildApp } from "./app";
import { montagemDe, recuperarDados, type ResultadoRecuperacao } from "./recuperacao";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_CONFIG = process.env.NUPE_DATA ? resolve(process.env.NUPE_DATA) : join(process.cwd(), "data", "nupe.json");
const recuperacao: ResultadoRecuperacao = recuperarDados(DATA_CONFIG);
const DATA_PATH = recuperacao.path;
const MONTAGEM = montagemDe(DATA_PATH);
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
const app = await buildApp({
  store,
  secret: SECRET,
  webDist: WEB_DIST,
  storage: {
    dataPath: DATA_PATH,
    dataConfig: DATA_CONFIG,
    restauradoDe: recuperacao.restauradoDe,
    candidatos: recuperacao.candidatos,
    volume: MONTAGEM.volume,
    montagemDesconhecida: MONTAGEM.desconhecido,
  },
});

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
app.log.info(
  {
    porta: PORT,
    host: HOST,
    dataPath: DATA_PATH,
    dataConfig: DATA_CONFIG,
    gravavel: store.gravaNoDisco,
    volume: MONTAGEM.volume,
    restauradoDe: recuperacao.restauradoDe,
  },
  "NUPE API pronta",
);
if (recuperacao.restauradoDe) {
  app.log.warn({ de: recuperacao.restauradoDe, para: DATA_PATH }, "Dados recuperados de uma cópia anterior");
}
if (MONTAGEM.volume === null && !MONTAGEM.desconhecido) {
  app.log.warn(
    { dataPath: DATA_PATH },
    "O arquivo de dados não está num volume montado: um novo deploy pode apagar tudo. Monte um volume e aponte NUPE_DATA para dentro dele.",
  );
}

// A hospedagem pode injetar PORT com um valor diferente do que o domínio
// público usa. Em vez de depender de as duas pontas baterem à mão, o app
// também atende na porta comum do domínio e repassa tudo para a principal.
// Acesso local não passa por aqui: é só para o proxy da hospedagem.
const PORTA_EXTRA = 3333;
if (PORT !== PORTA_EXTRA && !process.env.NUPE_SEM_PORTA_EXTRA) {
  const ponte = createServer((req, res) => {
    const repasse = httpRequest(
      { host: "127.0.0.1", port: PORT, method: req.method, path: req.url, headers: req.headers },
      (resposta) => {
        res.writeHead(resposta.statusCode ?? 502, resposta.headers);
        resposta.pipe(res);
      },
    );
    repasse.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Servidor indisponível." }));
    });
    req.pipe(repasse);
  });
  ponte.on("error", (e) => {
    app.log.info({ porta: PORTA_EXTRA, erro: e.message }, "Porta extra não aberta");
  });
  ponte.listen(PORTA_EXTRA, HOST, () => {
    app.log.info({ porta: PORTA_EXTRA }, "NUPE também atende nesta porta");
  });
}
