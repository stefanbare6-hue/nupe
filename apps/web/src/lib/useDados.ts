import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./http";

export type Estado<T> =
  | { fase: "carregando"; dados: null; erro: null }
  | { fase: "pronto"; dados: T; erro: null }
  | { fase: "erro"; dados: null; erro: string; status: number };

/** Carrega dados e permite recarregar. `chave` reinicia quando muda. */
export function useDados<T>(carregar: () => Promise<T>, chave: unknown[] = [], ativo = true) {
  const [estado, setEstado] = useState<Estado<T>>({ fase: "carregando", dados: null, erro: null });
  const versao = useRef(0);

  const recarregar = useCallback(async () => {
    if (!ativo) return;
    const v = ++versao.current;
    setEstado({ fase: "carregando", dados: null, erro: null });
    try {
      const dados = await carregar();
      if (v === versao.current) setEstado({ fase: "pronto", dados, erro: null });
    } catch (e) {
      if (v !== versao.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      const erro = e instanceof Error ? e.message : "Falha de conexão.";
      setEstado({ fase: "erro", dados: null, erro, status });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, ...chave]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { ...estado, recarregar };
}

