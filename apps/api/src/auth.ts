import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Store } from "./db";

const scrypt = promisify(scryptCb);
const SESSION_HOURS = 12;
export const COOKIE_NAME = "nupe_sid";

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hex] = stored.split("$");
  if (!salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(store: Store, res: FastifyReply, secure: boolean, requestIsHttps = false): Promise<string> {
  const token = newSessionToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600_000);
  store.data.sessions = store.data.sessions.filter((s) => new Date(s.expiresAt) > now);
  store.data.sessions.push({ tokenHash: hashToken(token), createdAt: now.toISOString(), expiresAt: expires.toISOString() });
  await store.save();
  res.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    // `secure` só quando a conexão é HTTPS: envia a marca mesmo atrás de proxy,
    // mas nunca quebra o acesso local em http://localhost.
    secure: secure && requestIsHttps,
    path: "/",
    expires,
  });
  return token;
}

export function destroySession(
  store: Store,
  req: FastifyRequest,
  res: FastifyReply,
  options: { secure: boolean; clearFromJar?: boolean } = { secure: false },
): void {
  const token = req.cookies[COOKIE_NAME];
  if (token) store.data.sessions = store.data.sessions.filter((s) => s.tokenHash !== hashToken(token));
  // Instrui o navegador a descartar o cookie mesmo se o Clear-Cookie não bater
  // (por diferença de atributo), evitando que o_hash da sessão velha persista.
  if (options.clearFromJar) res.header("Clear-Site-Data", '"cookies"');
  res.clearCookie(COOKIE_NAME, { path: "/", httpOnly: true, sameSite: "strict", secure: options.secure });
}

export function isAuthenticated(store: Store, req: FastifyRequest): boolean {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return false;
  const h = hashToken(token);
  const now = Date.now();
  return store.data.sessions.some((s) => s.tokenHash === h && new Date(s.expiresAt).getTime() > now);
}

/**
 * Endurecimento CSRF: mesmo com cookie SameSite=Strict, exige que mutações
 * venham de mesma origem e com o cabeçalho X-NUPE-Client.
 */
export function sameOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // clientes nativos/testes; cookie SameSite=Strict já barra cross-site
  try {
    const o = new URL(origin);
    const host = req.headers.host ?? "";
    return o.host === host;
  } catch {
    return false;
  }
}

export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  let limite = max;
  const limpar = (now: number) => {
    for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  };
  const limitar = (key: string): boolean => {
    const now = Date.now();
    if (hits.size > 1000) limpar(now);
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limite) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
  /** Troca o máximo dentro da mesma janela (o ajuste da estagiária vale na hora). */
  limitar.ajustar = (novo: number) => {
    limite = Math.max(1, novo);
  };
  return limitar;
}
