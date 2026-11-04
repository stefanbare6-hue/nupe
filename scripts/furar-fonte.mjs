// Registra o resolvedor de fonte para o Node (API Node 22.15+).
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const tentativa = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(tentativa))) return next(tentativa.href, context);
    }
    return next(specifier, context);
  },
});
