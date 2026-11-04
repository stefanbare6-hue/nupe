/**
 * Último lote completo de cada ficha que o servidor aceitou.
 *
 * Gravações completas (tudo ou nada) não podem se cruzar: uma requisição que
 * saiu antes e chega depois do servidor desfaria a mais nova. Por isso cada
 * lote leva um número de versão e o servidor recusa versão menor ou igual.
 */
const ultimaVersao: Record<string, number> = {};
/** Versão do último envio aceito em modo de conferência (depois de recarregar a ficha). */
const enviada: Record<string, number> = {};

/** Numera um lote da ficha. O número cresce mesmo sem recarregar da mesma tela. */
export function proximaVersao(kind: string): number {
  ultimaVersao[kind] = (ultimaVersao[kind] ?? 0) + 1;
  return ultimaVersao[kind];
}

/** O servidor informa a versão que guardou; a próxima nunca fica abaixo dela. */
export function sincronizarVersao(kind: string, versao: number) {
  if (Number.isFinite(versao) && versao > (ultimaVersao[kind] ?? 0)) ultimaVersao[kind] = versao;
}

/** Registra um envio aceito pelo servidor. */
export function marcarEnviada(kind: string, versao: number, reenviada: boolean) {
  enviada[kind] = versao;
  if (reenviada) sincronizarVersao(kind, versao);
}

/**
 * Chave de versão e de histórico de uma linha da ficha.
 *
 * A mesma regra vale no servidor (`apps/api/src/historico.ts`): cada linha tem
 * número próprio, então desfazer um erro numa linha não é confundido com
 * gravação velha das outras.
 */
export function chaveLinha(kind: string, id: string): string {
  return `${kind}:linha:${id}`;
}

/** Chave de um campo sem lista de linhas (fichas 1 e 6). */
export function chaveCampo(kind: string, campo: string): string {
  return `${kind}:campo:${campo}`;
}

/**
 * O servidor recusou o número enviado (outra aba ou outra sessão gravou antes).
 * Se este lote for a conferência do mesmo conteúdo, o servidor já tem a versão
 * mais nova guardada e não há o que regravar. Fora isso, renumera e segue.
 */
export function avancarVersao(kind: string, recusada: number): boolean {
  if (enviada[kind] === recusada) return true;
  sincronizarVersao(kind, Math.max(recusada, ultimaVersao[kind] ?? 0));
  return false;
}
