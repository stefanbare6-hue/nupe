/**
 * Voltar atrás numa linha das fichas.
 *
 * Cada linha (e cada campo da ficha 1) tem versão e cópia própria no servidor.
 * O botão "Desfazer" fica dentro da própria ficha, que sabe recarregar os dados
 * depois da volta atrás — senão a próxima edição partiria do texto velho e
 * apagaria o que acabou de ser restaurado.
 */
import { createContext, useContext } from "react";

/** Chave de versão e de histórico de uma linha da ficha. Mesma regra do servidor. */
export function chaveLinha(kind: string, id: string): string {
  return `${kind}:linha:${id}`;
}

/** Chave de um campo da ficha 1. */
export function chaveCampo(kind: string, campo: string): string {
  return `${kind}:campo:${campo}`;
}

/** O que a ficha oferece às linhas: pedir a volta atrás de uma linha gravada. */
export interface Recuperar {
  /** Chave que está sendo restaurada agora (o botão fica ocupado). */
  emCurso: string;
  /** Última mensagem de erro da restauração. */
  erro: string;
  /** Pede ao servidor o conteúdo anterior guardado para esta linha. */
  restaurar(chave: string): void;
}

export const RecuperarContexto = createContext<Recuperar>({
  emCurso: "",
  erro: "",
  restaurar: () => undefined,
});

export function useRecuperar() {
  return useContext(RecuperarContexto);
}

/** Botão "Desfazer", que só aparece onde o servidor tem cópia do conteúdo anterior. */
export function BotaoDesfazer({
  chave,
  temCopia,
  rotulo,
}: {
  chave: string;
  /** Já existe cópia anterior guardada para esta linha (lista vinda do servidor). */
  temCopia: boolean;
  /** Nome da linha, para leitores de tela. */
  rotulo: string;
}) {
  const recuperar = useRecuperar();
  if (!temCopia) return null;
  const ocupado = recuperar.emCurso === chave;
  return (
    <button
      type="button"
      className="btn sutil desfazer"
      aria-label={`Desfazer a última alteração de ${rotulo}`}
      title="Voltar esta linha ao conteúdo anterior"
      disabled={ocupado}
      onClick={() => recuperar.restaurar(chave)}
    >
      {ocupado ? "Voltando…" : "Desfazer"}
    </button>
  );
}
