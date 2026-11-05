/**
 * Chaves de versão e de histórico das fichas.
 *
 * Cada linha tem número próprio, então desfazer um erro numa linha não é
 * confundido com gravação velha das outras. Servidor (`apps/api/src/historico.ts`)
 * e cliente usam esta única definição.
 */

/** Chave de versão e de histórico de uma linha. */
export function chaveLinha(kind: string, id: string): string {
  return `${kind}:linha:${id}`;
}

/** Chave de versão e de histórico de um campo sem lista de linhas (fichas 1 e 6). */
export function chaveCampo(kind: string, campo: string): string {
  return `${kind}:campo:${campo}`;
}

/** Ficha dona de uma chave de campo ou de linha (o inverso das duas acima). */
export function fichaDaChave(chave: string): { kind: string; campo: string } | null {
  const campo = /^(.+?):campo:(.+)$/.exec(chave);
  if (campo && campo[1] && campo[2]) return { kind: campo[1], campo: campo[2] };
  const linha = /^(.+?):linha:/.exec(chave);
  return linha && linha[1] ? { kind: linha[1], campo: "" } : null;
}

/** Objeto simples (não vetor, não nulo): o corpo do envio pode trazer qualquer coisa. */
function plano(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Chaves de todas as linhas e campos que um envio de ficha em bloco carrega.
 *
 * O cliente usa para numerar o lote e o servidor para responder a versão e a
 * cópia anterior de cada linha tocada. As duas pontas precisam concordar: se
 * uma deixar de listar uma chave, o botão "Desfazer" some daquela linha, e se
 * listar chave a mais o envio fica abaixo da versão guardada.
 */
export function chavesDoLote(kind: string, body: Record<string, unknown>): string[] {
  const chaves: string[] = [];
  const lista = (campo: string) => (Array.isArray(body[campo]) ? (body[campo] as Array<{ id?: unknown }>) : []);
  const daLista = (itens: Array<{ id?: unknown }>) => {
    for (const x of itens) if (typeof x.id === "string" && x.id) chaves.push(chaveLinha(kind, x.id));
  };
  if (kind === "flows") daLista(lista("flows"));
  if (kind === "systems") daLista(lista("systems"));
  if (kind === "procedures") daLista(lista("procedures"));
  if (kind === "diary" || kind === "glossary") daLista(lista("rows"));
  if (kind === "matrices") {
    for (const grupo of [body.porter, body.swot]) {
      for (const l of Object.values(plano(grupo) ? grupo : {})) if (Array.isArray(l)) daLista(l);
    }
    daLista(lista("gut"));
  }
  if (kind === "institution") {
    daLista(lista("numbers"));
    for (const campo of Object.keys(plano(body.fields) ? body.fields : {})) chaves.push(chaveCampo("institution", campo));
  }
  if (kind === "improvement") {
    // A ficha 6 é gravada inteira: cada campo tem cópia e versão próprias.
    chaves.push(chaveCampo("improvement", "idea"));
    for (const campo of Object.keys(plano(body.fiveW2H) ? body.fiveW2H : {})) chaves.push(chaveCampo("improvement", `fiveW2H.${campo}`));
    for (const campo of Object.keys(plano(body.pdca) ? body.pdca : {})) chaves.push(chaveCampo("improvement", `pdca.${campo}`));
  }
  return chaves;
}
