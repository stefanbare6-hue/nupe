/** Cliente HTTP da API. Toda mutação envia o cabeçalho exigido pelo servidor (CSRF). */
import { avancarVersao, marcarEnviada, proximaVersao, sincronizarVersao } from "./versao";
import { FICHAS_COMPLETAS, chavesDoLote } from "./fichas";

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
function eFichaCompleta(path: string): string | null {
  const m = /^\/api\/records\/([a-z]+)$/.exec(path);
  return m && FICHAS_COMPLETAS.has(m[1]!) ? m[1]! : null;
}

function versaoDoLote(kind: string, body: unknown): number {
  let maior = proximaVersao(kind);
  const chaves = body && typeof body === "object" ? chavesDoLote(kind, body as Record<string, unknown>) : [];
  for (const chave of chaves) maior = Math.max(maior, proximaVersao(chave));
  return maior;
}

async function request<T>(method: string, path: string, body?: unknown, tentativa = 0): Promise<T> {
  const ficha = method === "PUT" ? eFichaCompleta(path) : null;
  // O número do lote é o maior entre as fichas que ele carrega: assim desfazer
  // um erro numa linha não fica abaixo da versão que o servidor guardou nela.
  const versao = ficha ? versaoDoLote(ficha, body) : null;
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
  const resposta = data as {
    error?: string;
    errors?: string[];
    versao?: unknown;
    ignorado?: boolean;
    versoes?: Record<string, unknown>;
    copias?: Record<string, unknown>;
  } | null;
  if (ficha && resposta && typeof resposta === "object") {
    // O servidor devolve a versão de cada linha que o envio tocou.
    if (resposta.versoes && typeof resposta.versoes === "object") {
      for (const [chave, valor] of Object.entries(resposta.versoes)) {
        if (chave !== ficha) sincronizarVersao(chave, Number(valor));
      }
    }
    const v = Number(resposta.versao);
    if (Number.isFinite(v)) {
      // Confirmação sem `ignorado` é a versão gravada. Com 409 é a que está no
      // servidor: a renumeração passa a partir dela.
      if (res.ok && !resposta.ignorado) marcarEnviada(ficha, v, tentativa > 0);
      sincronizarVersao(ficha, v);
    }
  }
  if (!res.ok) {
    if (res.status === 409 && ficha) {
      // Duas coisas chegam com 409: a gravação velha (abra outra vez) e o
      // contador zerado de um navegador novo. No primeiro caso, se este lote
      // só confere o que já está gravado, não há o que regravar; senão, a
      // ficha em conflito não pode ser envida de novo às cegas — a tela
      // avisa para recarregar antes de editar.
      const v = Number(resposta?.versao);
      if (Number.isFinite(v) && avancarVersao(ficha, v)) return data as T;
      if (tentativa === 0 && v === 0) return request<T>(method, path, body, tentativa + 1);
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
  /** Desfaz uma linha: o servidor devolve o conteúdo anterior guardado. */
  restaurar: async (chave: string) => {
    const resposta = await request<{ ok: boolean; kind?: string; versao?: unknown; versoes?: Record<string, unknown> }>(
      "POST",
      `/api/history/${encodeURIComponent(chave)}/restore`,
    );
    // A volta atrás sobe a versão da ficha e da linha: a tela aberta aqui já
    // passa a numerar acima dela, sem recarregar tudo.
    if (typeof resposta?.kind === "string") sincronizarVersao(resposta.kind, Number(resposta.versao));
    for (const [c, v] of Object.entries(resposta?.versoes ?? {})) sincronizarVersao(c, Number(v));
    return resposta;
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
