/**
 * Histórico das fichas: cada alteração guarda uma cópia do que havia antes.
 *
 * Serve para desfazer um erro depois de tudo registrado. A gravação da tela
 * manda a ficha inteira, então a comparação com o que está no servidor mostra
 * exatamente o que mudou: cada linha alterada (ou removida) ganha uma cópia e
 * volta a ter a sua versão própria, que cresce sozinha.
 *
 * A cópia é só das linhas que mudaram. Na ficha 1, só dos campos mexidos.
 */
import { chaveCampo, chaveLinha, fichaDaChave } from "@nupe/core";
import type { DB, VersaoFicha } from "./db";

/** Quantas cópias de cada linha ficam guardadas. */
export const MAX_HISTORICO = 20;

/** Fichas em que cada item tem identidade própria (id). */
export const LISTAS: Record<string, { campo: string }> = {
  flows: { campo: "flows" },
  systems: { campo: "systems" },
  procedures: { campo: "procedures" },
  diary: { campo: "diary" },
  glossary: { campo: "glossary" },
};

/** Fichas guardadas como um bloco só, com lista de itens dentro. */
export const BLOCO: Record<string, { chave: string; itens: string }> = {
  matrices: { chave: "porter", itens: "porter" },
  institution: { chave: "numbers", itens: "numbers" },
};

/**
 * Parte editável de cada ficha, sem carimbos de hora. A comparação é feita
 * depois de passar por aqui: mudar só o horário não conta como alteração.
 */
export function conteudoDe(kind: string, data: DB): unknown {
  switch (kind) {
    case "institution": {
      const { fields, numbers } = data.institution;
      return { fields: fields ?? {}, numbers: numbers ?? [] };
    }
    case "matrices":
      return semNotas(data.matrices);
    case "flows":
      return data.flows;
    case "systems":
      return data.systems;
    case "procedures":
      return data.procedures;
    case "improvement": {
      const { idea, fiveW2H, pdca } = data.improvement;
      return { idea: idea ?? "", fiveW2H: fiveW2H ?? {}, pdca: pdca ?? {} };
    }
    case "diary":
      return data.diary;
    case "glossary":
      return data.glossary;
    default:
      return null;
  }
}

function semNotas(m: DB["matrices"]): unknown {
  const { notes, ...resto } = m;
  void notes;
  return resto;
}

/** Identificador de cada item da ficha, na ordem em que aparece na tela. */
export function itensDe(kind: string, conteudo: unknown): Array<{ id: string; item: unknown }> {
  if (!conteudo || typeof conteudo !== "object") return [];
  if (LISTAS[kind]) {
    // As fichas de lista chegam como o próprio vetor de itens (não embrulhado
    // no nome do campo), então aqui ele já é o conteúdo.
    return Array.isArray(conteudo) ? conteudo.filter(temId).map((item) => ({ id: item.id, item })) : [];
  }
  if (kind === "matrices") {
    const { porter, swot, gut } = conteudo as DB["matrices"];
    return [
      ...porters(porter),
      ...swotItens(swot),
      ...(Array.isArray(gut) ? gut.filter(temId).map((item) => ({ id: item.id, item })) : []),
    ];
  }
  if (kind === "institution") {
    const numeros = (conteudo as { numbers?: unknown }).numbers;
    return Array.isArray(numeros) ? numeros.filter(temId).map((item) => ({ id: item.id, item })) : [];
  }
  return [];
}

function temId(x: unknown): x is { id: string } {
  return !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string";
}

function porters(p: DB["matrices"]["porter"]): Array<{ id: string; item: unknown }> {
  const out: Array<{ id: string; item: unknown }> = [];
  for (const lista of Object.values(p)) {
    for (const x of lista) if (temId(x)) out.push({ id: x.id, item: x });
  }
  return out;
}

function swotItens(s: DB["matrices"]["swot"]): Array<{ id: string; item: unknown }> {
  const out: Array<{ id: string; item: unknown }> = [];
  for (const lista of Object.values(s)) {
    for (const x of lista) if (temId(x)) out.push({ id: x.id, item: x });
  }
  return out;
}

/** Campo da ficha 1, dentro do objeto `fields`. */
function campoDaFicha1(database: DB, campo: string): string {
  return database.institution.fields?.[campo] ?? "";
}

function gravarFicha1(database: DB, campo: string, valor: string, at: string) {
  database.institution.fields = { ...database.institution.fields, [campo]: valor };
  database.institution.updatedAt = at;
}

/** Campo da ficha 6: `idea`, `fiveW2H.<chave>` ou `pdca.<chave>`. */
function campoDaFicha6(database: DB, campo: string): string {
  const [grupo, chave] = campo.split(".");
  if (!chave) return database.improvement.idea ?? "";
  const mapa = grupo === "pdca" ? database.improvement.pdca : database.improvement.fiveW2H;
  return mapa?.[chave] ?? "";
}

function gravarFicha6(database: DB, campo: string, valor: string) {
  const [grupo, chave] = campo.split(".");
  const imp = database.improvement;
  if (!chave) {
    database.improvement = { ...imp, idea: valor };
  } else if (grupo === "pdca") {
    database.improvement = { ...imp, pdca: { ...imp.pdca, [chave]: valor } };
  } else {
    database.improvement = { ...imp, fiveW2H: { ...imp.fiveW2H, [chave]: valor } };
  }
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Todos os nomes de campo de uma ficha sem linhas (ficha 1 e ficha 6). */
function camposDe(kind: string, a: unknown, b: unknown): string[] {
  const nomes = new Set<string>();
  const juntar = (conteudo: unknown) => {
    if (!conteudo || typeof conteudo !== "object") return;
    const c = conteudo as { fields?: Record<string, unknown>; fiveW2H?: Record<string, unknown>; pdca?: Record<string, unknown> };
    if (kind === "institution") for (const k of Object.keys(c.fields ?? {})) nomes.add(k);
    else {
      nomes.add("idea");
      for (const k of Object.keys(c.fiveW2H ?? {})) nomes.add(`fiveW2H.${k}`);
      for (const k of Object.keys(c.pdca ?? {})) nomes.add(`pdca.${k}`);
    }
  };
  juntar(a);
  juntar(b);
  return [...nomes];
}

function valorDoCampo(kind: string, conteudo: unknown, campo: string): string {
  const c = (conteudo ?? {}) as {
    fields?: Record<string, string>;
    idea?: string;
    fiveW2H?: Record<string, string>;
    pdca?: Record<string, string>;
  };
  if (kind === "institution") return c.fields?.[campo] ?? "";
  const [grupo, chave] = campo.split(".");
  if (!chave) return c.idea ?? "";
  return (grupo === "pdca" ? c.pdca : c.fiveW2H)?.[chave] ?? "";
}

function guardar(database: DB, chave: string, versao: number, item: unknown, at: string) {
  const lista = database.history[chave] ?? [];
  const ultima = lista[lista.length - 1];
  // Mesma versão que já está no topo (duas gravações seguidas de nada): não repete.
  if (ultima && ultima.versao === versao && igual(ultima.item, item)) return;
  lista.push({ versao, at, item });
  if (lista.length > MAX_HISTORICO) lista.splice(0, lista.length - MAX_HISTORICO);
  database.history[chave] = lista;
}

/**
 * Compara o que chega com o que está guardado, antes de gravar o novo.
 * - linha mudou: copia a anterior e sobe a versão da linha;
 * - linha removida: a cópia que já existe passa a ser o "antes" desta remoção
 *   (e o conteúdo removido vai para ela), então desfazer apaga e refazer
 *   traz de volta, como num editor;
 * - linha nova: começa na versão 1, sem cópia.
 */
export function registrarMudancas(
  database: DB,
  kind: string,
  antes: unknown,
  depois: unknown,
  versao: number,
  at: string,
) {
  if (kind === "institution" || kind === "improvement") {
    for (const campo of camposDe(kind, antes, depois)) {
      const antes1 = valorDoCampo(kind, antes, campo);
      const depois1 = valorDoCampo(kind, depois, campo);
      if (igual(antes1, depois1)) continue;
      const chave = chaveCampo(kind, campo);
      const atual = database.recordVersions[chave] ?? 0;
      guardar(database, chave, atual, antes1, at);
      database.recordVersions[chave] = Math.max(atual + 1, versao);
    }
  }

  const antesItens = new Map(itensDe(kind, antes).map((x) => [x.id, x.item]));
  const depoisItens = new Map(itensDe(kind, depois).map((x) => [x.id, x.item]));
  const ids = new Set([...antesItens.keys(), ...depoisItens.keys()]);
  for (const id of ids) {
    const chave = chaveLinha(kind, id);
    const atual = database.recordVersions[chave] ?? 0;
    if (!antesItens.has(id)) {
      // Linha nova: não há conteúdo anterior, e é isso que a cópia guarda. Assim
      // a primeira edição de qualquer linha também pode ser desfeita.
      guardar(database, chave, atual, null, at);
      database.recordVersions[chave] = Math.max(atual + 1, versao);
      continue;
    }
    if (igual(antesItens.get(id), depoisItens.get(id))) continue;
    guardar(database, chave, atual, antesItens.get(id), at);
    database.recordVersions[chave] = Math.max(atual + 1, versao);
  }
}

/** Conteúdo anterior de uma linha ou campo, ou null se não houver cópia. */
export function anterior(database: DB, chave: string): VersaoFicha | null {
  return database.history[chave]?.[database.history[chave]!.length - 1] ?? null;
}

const CAMPOS = /^institution:campo:(.+)$/;

function bump(database: DB, kind: string) {
  database.recordVersions[kind] = (database.recordVersions[kind] ?? 0) + 1;
}

/**
 * Volta a linha ou o campo (fichas 1 e 6) ao conteúdo da cópia mais recente e
 * devolve o nome da ficha mexida, ou null se não houver cópia.
 *
 * A cópia consumida é trocada pelo que estava no lugar dela: desfazer a volta
 * atrás devolve a alteração, e a próxima volta atrás pega a cópia anterior.
 */
export function restaurar(database: DB, chave: string): string | null {
  const lista = database.history[chave];
  const copia = lista?.[lista.length - 1];
  if (!lista || !copia) return null;
  const at = new Date().toISOString();

  const daChave = fichaDaChave(chave);
  if (daChave?.campo) {
    const { kind, campo } = daChave;
    if (kind !== "institution" && kind !== "improvement") return null;
    const agora = kind === "institution" ? campoDaFicha1(database, campo) : campoDaFicha6(database, campo);
    const valor = String(copia.item ?? "");
    if (kind === "institution") gravarFicha1(database, campo, valor, at);
    else gravarFicha6(database, campo, valor);
    trocarTopo(lista, database, chave, agora, at);
    bump(database, kind);
    return kind;
  }

  const m = /^(.+?):linha:(.+)$/.exec(chave);
  const kind = m?.[1] ?? "";
  const id = m?.[2] ?? "";
  if (!id) return null;
  const atual = itensDe(kind, conteudoDe(kind, database)).find((x) => x.id === id)?.item ?? null;
  // Cópia nula quer dizer que a linha não existia naquela hora. Se ela já não
  // está, não há o que desfazer (nem nada a perder).
  if (copia.item == null && !atual) return null;
  if (!substituirLinha(database, kind, id, copia.item)) return null;
  // A cópia que desfizemos recebe o que estava no lugar. Removida, o lugar
  // está vazio: a próxima volta atrás tira a linha de novo.
  trocarTopo(lista, database, chave, atual, at);
  bump(database, kind);
  return kind;
}

/** Troca a cópia consumida pelo que estava no lugar dela (nenhum, se a linha sumiu). */
function trocarTopo(lista: VersaoFicha[], database: DB, chave: string, item: unknown, at: string) {
  lista.pop();
  lista.push({ versao: database.recordVersions[chave] ?? 0, at, item: item ?? null });
}

/** Põe a linha no lugar dela; sem lugar vago, vai para o fim. */
function substituirLinha(database: DB, kind: string, id: string, item: unknown): boolean {
  if (item === null) return removerLinha(database, kind, id);
  if (LISTAS[kind]) {
    if (!item || typeof item !== "object") return false;
    const campo = LISTAS[kind]!.campo as "flows" | "systems" | "procedures" | "diary" | "glossary";
    const lista = database[campo] as unknown as Array<{ id: string }>;
    const i = lista.findIndex((x) => x.id === id);
    if (i >= 0) lista[i] = item as { id: string };
    else lista.push(item as { id: string });
    return true;
  }
  if (kind === "institution") {
    if (!item || typeof item !== "object") return false;
    const i = database.institution.numbers.findIndex((x) => x.id === id);
    if (i >= 0) database.institution.numbers[i] = item as DB["institution"]["numbers"][number];
    else database.institution.numbers.push(item as DB["institution"]["numbers"][number]);
    database.institution.updatedAt = new Date().toISOString();
    return true;
  }
  if (kind === "matrices") {
    if (!item || typeof item !== "object") return false;
    const alvo = item as { id: string };
    const daMatriz = database.matrices as unknown as Record<string, Record<string, Array<{ id: string }>> | undefined>;
    for (const nome of ["porter", "swot"]) {
      const grupo = daMatriz[nome];
      if (!grupo || typeof grupo !== "object") continue;
      for (const lista of Object.values(grupo)) {
        const i = lista.findIndex((x) => x.id === id);
        if (i >= 0) {
          lista[i] = alvo;
          return true;
        }
      }
    }
    const gut = database.matrices.gut as unknown as Array<{ id: string }>;
    const i = gut.findIndex((x) => x.id === id);
    if (i >= 0) {
      gut[i] = alvo;
      return true;
    }
    // Item removido: volta na primeira lista (clientes do Porter). O relatório
    // mostra o item; a coluna em que ele vive não muda o texto.
    database.matrices.porter.clientes.push(alvo as DB["matrices"]["porter"]["clientes"][number]);
    return true;
  }
  return false;
}

/** Tira a linha de todas as listas da ficha. Serve para desfazer "restaurar". */
function removerLinha(database: DB, kind: string, id: string): boolean {
  const tirar = (lista: Array<{ id: string }>) => {
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) return false;
    lista.splice(i, 1);
    return true;
  };
  if (LISTAS[kind]) {
    const campo = LISTAS[kind]!.campo as "flows" | "systems" | "procedures" | "diary" | "glossary";
    return tirar(database[campo] as unknown as Array<{ id: string }>);
  }
  if (kind === "institution") return tirar(database.institution.numbers as unknown as Array<{ id: string }>);
  if (kind === "matrices") {
    let apagou = tirar(database.matrices.gut as unknown as Array<{ id: string }>);
    for (const lista of Object.values(database.matrices.porter) as Array<Array<{ id: string }>>) apagou = tirar(lista) || apagou;
    for (const lista of Object.values(database.matrices.swot) as Array<Array<{ id: string }>>) apagou = tirar(lista) || apagou;
    return apagou;
  }
  return false;
}

/** Zera o histórico de uma ficha inteira (a ficha, os campos e as linhas). */
export function esquecer(database: DB, kind: string) {
  for (const chave of Object.keys(database.history)) {
    if (chave === kind || chave.startsWith(`${kind}:linha:`) || chave.startsWith(`${kind}:campo:`)) {
      delete database.history[chave];
    }
  }
  for (const chave of Object.keys(database.recordVersions)) {
    if (chave === kind || chave.startsWith(`${kind}:linha:`) || chave.startsWith(`${kind}:campo:`)) {
      delete database.recordVersions[chave];
    }
  }
}

/** Todas as cópias guardadas de uma linha ou campo, da mais antiga para a mais recente. */
export function copias(database: DB, chave: string): VersaoFicha[] {
  return (database.history[chave] ?? []).slice();
}

