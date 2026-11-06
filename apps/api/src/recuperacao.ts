import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * O caminho do arquivo de dados mudou de /dados para /var/nupe numa versão
 * anterior. Se o volume ficou montado no caminho antigo, o app novo abria um
 * arquivo vazio e parecia que os dados tinham sumido. Esta rotina procura o
 * arquivo antigo e as cópias diárias antes de desistir e começar do zero.
 * Ela só age quando o arquivo configurado não tem administrador.
 */

export interface CandidatoDados {
  path: string;
  existe: boolean;
  admin: boolean;
  entradas: number;
  bytes: number;
  atualizadoEm: string | null;
}

export interface ResultadoRecuperacao {
  path: string;
  restauradoDe: string | null;
  candidatos: CandidatoDados[];
}

interface Inspecao extends CandidatoDados {
  conteudo: string | null;
}

function inspecionar(path: string): Inspecao {
  const vazio: Inspecao = { path, existe: false, admin: false, entradas: 0, bytes: 0, atualizadoEm: null, conteudo: null };
  try {
    const info = statSync(path);
    if (!info.isFile()) return { ...vazio, existe: true };
    const conteudo = readFileSync(path, "utf8");
    const json = JSON.parse(conteudo) as { admin?: unknown; entries?: unknown };
    return {
      path,
      existe: true,
      admin: Boolean(json.admin),
      entradas: Array.isArray(json.entries) ? json.entries.length : 0,
      bytes: info.size,
      atualizadoEm: info.mtime.toISOString(),
      conteudo,
    };
  } catch {
    return vazio;
  }
}

function caminhos(configPath: string, incluirConhecidos: boolean): string[] {
  const lista = [resolve(configPath)];
  if (incluirConhecidos) {
    lista.push("/dados/nupe.json", "/dados/dados.json", "/var/nupe/nupe.json", "/var/nupe/dados.json", join(process.cwd(), "data", "nupe.json"));
  }
  return [...new Set(lista)];
}

function melhorPorConteudo(itens: Inspecao[]): Inspecao | null {
  return (
    [...itens]
      .filter((i) => i.admin)
      .sort((a, b) => b.entradas - a.entradas || (b.atualizadoEm ?? "").localeCompare(a.atualizadoEm ?? ""))[0] ?? null
  );
}

function backupsComAdmin(pasta: string): Inspecao[] {
  try {
    return readdirSync(pasta)
      .filter((nome) => /^nupe-\d{4}-\d{2}-\d{2}\.json$/.test(nome))
      .map((nome) => inspecionar(join(pasta, nome)))
      .filter((i) => i.admin);
  } catch {
    return [];
  }
}

/**
 * Descobre qual arquivo abrir. Nunca troca um arquivo configurado que já tem
 * administrador; só procura alternativas quando ele está vazio ou ausente.
 */
export function recuperarDados(configPath: string, extras: string[] = [], incluirConhecidos = true): ResultadoRecuperacao {
  const candidatos = [...new Set([...caminhos(configPath, incluirConhecidos), ...extras.map((x) => resolve(x))])];
  const inspecoes = candidatos.map(inspecionar);
  const atual = inspecoes.find((i) => i.path === resolve(configPath))!;

  if (atual.admin) {
    return { path: atual.path, restauradoDe: null, candidatos: inspecoes.map(semConteudo) };
  }

  const antigo = melhorPorConteudo(inspecoes.filter((i) => i.path !== atual.path));
  if (antigo) {
    return { path: antigo.path, restauradoDe: antigo.path, candidatos: inspecoes.map(semConteudo) };
  }

  // Nenhum arquivo principal tem administrador. A cópia diária mais recente
  // que ainda tenha os dados pode ser a última saída antes da perda.
  const pastas = [...new Set(inspecoes.map((i) => join(dirname(i.path), "backups")))];
  const copias = pastas.flatMap((pasta) => backupsComAdmin(pasta));
  const copia = melhorPorConteudo(copias);
  if (copia) {
    const pastaBackup = dirname(copia.path);
    const alvo = resolve(configPath).startsWith(dirname(pastaBackup) + sep)
      ? resolve(configPath)
      : join(dirname(pastaBackup), "nupe.json");
    try {
      mkdirSync(dirname(alvo), { recursive: true });
      writeFileSync(alvo, copia.conteudo ?? "", "utf8");
      const restaurado = inspecionar(alvo);
      return {
        path: alvo,
        restauradoDe: copia.path,
        candidatos: [...inspecoes.map(semConteudo), semConteudo(restaurado)],
      };
    } catch {
      // Sem permissão para restaurar: segue com o caminho configurado e o
      // diagnóstico no /api/health mostra o que foi encontrado.
    }
  }

  return { path: atual.path, restauradoDe: null, candidatos: inspecoes.map(semConteudo) };
}

function semConteudo(i: Inspecao): CandidatoDados {
  return {
    path: i.path,
    existe: i.existe,
    admin: i.admin,
    entradas: i.entradas,
    bytes: i.bytes,
    atualizadoEm: i.atualizadoEm,
  };
}

/**
 * Diz se o arquivo está num ponto de montagem que não é a raiz do contêiner.
 * No Railway, a raiz é descartada a cada deploy; o volume aparece como uma
 * montagem própria. Fora do Linux, devolve null (não dá para saber).
 */
export function montagemDe(path: string): { volume: string | null; desconhecido: boolean } {
  try {
    const alvo = resolve(path);
    let melhor = "";
    for (const linha of readFileSync("/proc/self/mountinfo", "utf8").split("\n")) {
      const ponto = linha.split(" ")[4];
      if (!ponto) continue;
      const prefixo = ponto.endsWith("/") ? ponto : ponto + "/";
      if ((alvo === ponto || alvo.startsWith(prefixo)) && ponto.length > melhor.length) melhor = ponto;
    }
    if (!melhor) return { volume: null, desconhecido: true };
    return { volume: melhor === "/" ? null : melhor, desconhecido: false };
  } catch {
    return { volume: null, desconhecido: true };
  }
}
