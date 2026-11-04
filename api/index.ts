// Vercel: uma só função Node recebe todas as rotas (ver vercel.json).
// Os dados ficam em um arquivo JSON (NUPE_DATA). Na Vercel só /tmp é gravável
// e não sobrevive entre execuções, então este modo serve para demonstração.
// Para uso real, use Render, Railway ou Fly com disco anexado.
//
// Os imports usam o código-fonte (tsconfig.check.json resolve @nupe/core para
// src), porque a Vercel empacota a função por conta própria.
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { buildApp } from "../apps/api/src/app.ts";
import { Store } from "../apps/api/src/db.ts";

const app = await buildApp({
  store: await Store.open(process.env.NUPE_DATA || "/tmp/nupe.json"),
  secret: process.env.NUPE_SECRET || "vercel-sem-segredo-configurado",
  webDist: join(process.cwd(), "apps/web/dist"),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  // O Fastify converte o pedido HTTP cru em resposta, preservando o streaming
  // dos arquivos estáticos e os cabeçalhos de segurança.
  app.server.emit("request", req, res);
}
