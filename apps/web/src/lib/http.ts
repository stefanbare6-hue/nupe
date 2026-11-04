/** Cliente HTTP da API. Toda mutação envia o cabeçalho exigido pelo servidor (CSRF). */
import { avancarVersao, chaveCampo, chaveLinha, marcarEnviada, proximaVersao, sincronizarVersao } from "./versao";

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

/** Chaves de versão de todas as linhas e campos que o lote carrega. */
function chavesDoLote(kind: string, body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const lista = (campo: string) => (Array.isArray(b[campo]) ? (b[campo] as Array<{ id?: unknown }>) : []);
  const itens = (x: unknown) => (Array.isArray(x) ? (x as Array<{ id?: unknown }>) : []);
  const chaves: string[] = [];
  const certa = (id: unknown) => {
    if (typeof id === "string" && id) chaves.push(chaveLinha(kind, id));
  };
  if (kind === "flows") lista("flows").forEach((x) => certa(x.id));
  if (kind === "systems") lista("systems").forEach((x) => certa(x.id));
  if (kind === "procedures") lista("procedures").forEach((x) => certa(x.id));
  if (kind === "diary" || kind === "glossary") lista("rows").forEach((x) => certa(x.id));
  if (kind === "institution") {
    lista("numbers").forEach((x) => certa(x.id));
    for (const campo of Object.keys((b.fields as Record<string, unknown> | undefined) ?? {})) chaves.push(chaveCampo("institution", campo));
  }
  if (kind === "improvement") {
    chaves.push(chaveCampo("improvement", "idea"));
    for (const campo of Object.keys((b.fiveW2H as Record<string, unknown> | undefined) ?? {})) chaves.push(chaveCampo("improvement", `fiveW2H.${campo}`));
    for (const campo of Object.keys((b.pdca as Record<string, unknown> | undefined) ?? {})) chaves.push(chaveCampo("improvement", `pdca.${campo}`));
  }
  if (kind === "matrices") {
    const m = b as { porter?: Record<string, unknown>; swot?: Record<string, unknown>; gut?: unknown };
    for (const grupo of [m.porter, m.swot]) {
      for (const l of Object.values(grupo ?? {})) itens(l).forEach((x) => certa(x.id));
    }
    itens(m.gut).forEach((x) => certa(x.id));
  }
  return chaves;
}

function versaoDoLote(kind: string, body: unknown): number {
  let maior = proximaVersao(kind);
  for (const chave of chavesDoLote(kind, body)) maior = Math.max(maior, proximaVersao(chave));
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
  if (res.status === 409) throw new ApiError(409, resposta?.error ?? "Não foi possível concluir a operação.", resposta?.errors ?? []);
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
      for (const [kind, valor] of Object.entries(versoes)) sincronizarVersao(kind, Number(valor));    }
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
