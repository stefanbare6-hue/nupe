/**
 * Chaves de versão e de histórico das fichas — a mesma regra usada pelo servidor.
 *
 * A definição mora em `@nupe/core` (`packages/core/src/fichas.ts`) para que
 * cliente e servidor nunca divirjam. Aqui fica só a lista das fichas que o
 * envio manda em bloco.
 */
export { chaveCampo, chaveLinha, chavesDoLote } from "@nupe/core";

/** Fichas gravadas em bloco: o envio manda a ficha inteira e leva um número de versão. */
export const FICHAS_COMPLETAS = new Set(["institution", "matrices", "flows", "systems", "procedures", "diary", "glossary", "improvement"]);
