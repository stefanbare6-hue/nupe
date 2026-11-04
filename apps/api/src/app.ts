import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Store } from "./db";
import { registerPublicRoutes } from "./routes-public";
import { registerAdminRoutes } from "./routes-admin";
import { sameOrigin } from "./auth";

/**
 * Monta a aplicação sobre um armazenamento já aberto. Separado da inicialização
 * (server.ts) para que os testes subam a mesma aplicação numa porta efêmera.
 */
export async function buildApp(options: {
  store: Store;
  secret: string;
  webDist?: string | null;
}): Promise<FastifyInstance> {
  const { store, secret } = options;
  const app = Fastify({
    logger: process.env.LOG_LEVEL ? { level: process.env.LOG_LEVEL } : false,
    trustProxy: process.env.NUPE_BEHIND_PROXY === "1",
    bodyLimit: 200 * 1024,
  });

  await app.register(cookie);

  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    // CSRF: mutações precisam vir da própria origem e com o cabeçalho do cliente.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.url.startsWith("/api/")) {
      const isPublicSurvey = /^\/api\/public\/surveys\/[^/]+\/responses$/.test(req.url);
      if (!isPublicSurvey && (req.headers["x-nupe-client"] !== "web" || !sameOrigin(req))) {
        return reply.code(403).send({ error: "Requisição recusada." });
      }
    }
  });

  await registerPublicRoutes(app, store, secret);
  await registerAdminRoutes(app, store, secret);

  app.get("/api/health", async () => ({ ok: true }));

  if (options.webDist && existsSync(options.webDist)) {
    // wildcard: false registra só os arquivos de raiz; sem a lista de padrões, os
    // arquivos de /assets caíam no index.html e o navegador os recusava.
    app.register(fastifyStatic, { root: options.webDist, wildcard: false, index: "index.html" });
    app.register(fastifyStatic, {
      root: options.webDist,
      prefix: "/assets/",
      decorateReply: false,
      index: false,
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Não encontrado." });
      if (req.method !== "GET") return reply.code(405).send({ error: "Método não permitido." });
      const caminho = decodeURIComponent((req.url.split("?")[0] ?? "").slice(1));
      // Pedido de arquivo que não existe responde 404 em vez de devolver o HTML:
      // senão o navegador recebe "text/html" para uma folha de estilo ou script.
      const ehArquivo = caminho && /\.[a-z0-9]{2,8}$/i.test(caminho);
      if (ehArquivo) {
        // Arquivo real fora de /assets (ícone, fonte) é servido; o resto é 404.
        if (!caminho.startsWith("assets/")) {
          const raiz = resolve(options.webDist ?? ".");
          const real = resolve(raiz, caminho);
          const dentro = real === raiz || real.startsWith(raiz + sep);
          if (dentro && existsSync(real)) return reply.sendFile(caminho);
        }
        return reply.code(404).type("text/plain; charset=utf-8").send("Arquivo não encontrado.");
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
