import { useCallback, useEffect, useState } from "react";
import { aguardarGravacao, haPendencia } from "./gravacao";

/** Roteador mínimo sobre History API. O servidor devolve index.html em qualquer rota. */
export function useRota(): string {
  const [rota, setRota] = useState(() => window.location.pathname + window.location.search);
  // O histórico já foi usado pelo navegador: todo `popstate` é uma troca de rota.
  useEffect(() => {
    const aoTrocar = () => {
      // Edição não enviada de uma tela que saiu vai junto, sem esperar.
      if (haPendencia()) void aguardarGravacao();
      setRota(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", aoTrocar);
    return () => window.removeEventListener("popstate", aoTrocar);
  }, []);
  return rota;
}

export function irPara(para: string, substituir = false): void {
  if (para === window.location.pathname + window.location.search) return;
  const navegar = () => {
    if (substituir) window.history.replaceState({}, "", para);
    else window.history.pushState({}, "", para);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  // Sair de uma tela com edição ainda não enviada espera a gravação terminar.
  if (haPendencia()) {
    void aguardarGravacao().finally(navegar);
    return;
  }
  navegar();
}

export function useNavegar(): (para: string, substituir?: boolean) => void {
  return useCallback((para: string, substituir?: boolean) => irPara(para, substituir), []);
}

/** Divide a rota em segmentos decodificados: ["fichas", "3"]. */
export function segmentos(rota: string): string[] {
  return rota.split("?")[0]!.split("/").filter(Boolean).map(decodeURIComponent);
}

export function consulta(rota: string): URLSearchParams {
  const i = rota.indexOf("?");
  return new URLSearchParams(i >= 0 ? rota.slice(i + 1) : "");
}
