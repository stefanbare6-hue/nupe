/** Cliente HTTP da API. Toda mutação envia o cabeçalho exigido pelo servidor (CSRF). */
import { avancarVersao, marcarEnviada, proximaVersao, sincronizarVersao } from "./versao";

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];
  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function enviar(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "x-nupe-client": "web",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Fichas salvas por lote completo: o envio leva a versão e lê a que o servidor guardou. */
const FICHAS_COMPLETAS = new Set([
  "institution",
  "matrices",
  "flows",
  "systems",
  "procedures",
  "diary",
  "glossary",
  "improvement",
]);

function eFichaCompleta(path: string): string | null {
  const m = /^\/api\/records\/([a-z]+)$/.exec(path);
  return m && FICHAS_COMPLETAS.has(m[1]!) ? m[1]! : null;
}

async function request<T>(method: string, path: string, body?: unknown, tentativa = 0): Promise<T> {
  const ficha = method === "PUT" ? eFichaCompleta(path) : null;
  const versao = ficha ? proximaVersao(ficha) : null;
  const corpo = ficha && body && typeof body === "object" ? { ...(body as object), versao } : body;
  let res: Response;
  try {
    res = await enviar(method, path, corpo);
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique a rede e tente de novo.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const resposta = data as { error?: string; errors?: string[]; versao?: unknown; ignorado?: boolean } | null;
  if (ficha && resposta && typeof resposta === "object") {
    const v = Number(resposta.versao);
    if (Number.isFinite(v)) {
      // Confirmação sem `ignorado` é a versão gravada. Com 409 é a que está no
      // servidor: a renumeração passa a partir dela.
      if (res.ok && !resposta.ignorado) marcarEnviada(ficha, v, tentativa > 0);
      sincronizarVersao(ficha, v);
    }
  }
  if (!res.ok) {
    // O navegador recomeçou o contador (outra aba salvou antes). Se este lote é
    // só a conferência do que já está gravado, nada a fazer: o servidor ficou
    // com a versão mais nova. Senão renumera e envia de novo, uma vez.
    if (res.status === 409 && ficha) {
      const v = Number(resposta?.versao);
      if (Number.isFinite(v) && avancarVersao(ficha, v)) return data as T;
      if (tentativa === 0) return request<T>(method, path, body, tentativa + 1);
    }
    throw new ApiError(res.status, resposta?.error ?? "Não foi possível concluir a operação.", resposta?.errors ?? []);
  }
  return data as T;
}

export const api = {
  get: async <T>(path: string) => {
    const dados = await request<T>("GET", path);
    // A leitura das fichas traz a última versão aceita: o contador local parte dela.
    const versoes = (dados as { recordVersions?: Record<string, unknown> } | null)?.recordVersions;
    if (versoes && typeof versoes === "object") {
      for (const [kind, valor] of Object.entries(versoes)) sincronizarVersao(kind, Number(valor));
    }
    return dados;
  },
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Identificador anônimo do navegador, usado só para impedir envio repetido. */
export function idDaSessao(): string {
  const key = "nupe.sessao";
  let id = localStorage.getItem(key);
  if (!id || id.length < 20) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(key, id);
  }
  return id;
}
