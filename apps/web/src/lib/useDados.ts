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

/** Salva com atraso (autosave) e devolve o estado do selo "Salvo às ...". */
export function useAutosave(salvar: (dados: unknown) => Promise<unknown>, atraso = 800) {
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo" | "erro">("parado");
  const [quando, setQuando] = useState<Date | null>(null);
  const [erro, setErro] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<unknown>(undefined);
  const emCurso = useRef(false);

  const gravar = useCallback(async () => {
    if (emCurso.current) return;
    if (pendente.current === undefined) return;
    const dados = pendente.current;
    pendente.current = undefined;
    emCurso.current = true;
    setEstado("salvando");
    try {
      await salvar(dados);
      setQuando(new Date());
      setEstado(pendente.current !== undefined ? "parado" : "salvo");
      setErro("");
    } catch (e) {
      setEstado("erro");
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      emCurso.current = false;
      if (pendente.current !== undefined) {
        timer.current = setTimeout(() => void gravar(), atraso);
      }
    }
  }, [salvar, atraso]);

  const agendar = useCallback(
    (dados: unknown) => {
      pendente.current = dados;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void gravar(), atraso);
    },
    [gravar, atraso],
  );

  const salvarAgora = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await gravar();
  }, [gravar]);

  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (pendente.current !== undefined || emCurso.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", aviso);
    return () => {
      window.removeEventListener("beforeunload", aviso);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const texto =
    estado === "salvando"
      ? "Salvando…"
      : estado === "erro"
        ? `Não salvou: ${erro}`
        : estado === "salvo" && quando
          ? `Salvo às ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : "";

  return { agendar, salvarAgora, estado, texto };
}
