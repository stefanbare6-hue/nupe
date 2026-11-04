import { useEffect } from "react";
import { api } from "./http";

/**
 * Há administrador cadastrado? Consulta sem escrever nada. A resposta é
 * compartilhada, então a tela de acesso nunca sobrescreve a de configuração.
 */
let pedido: Promise<boolean> | null = null;

export function verificarConfiguracao(): Promise<boolean> {
  if (!pedido) {
    pedido = api
      .get<{ needsSetup: boolean }>("/api/setup/status")
      .then((r) => r.needsSetup)
      .catch(() => false);
  }
  return pedido;
}

export function limparVerificacao(): void {
  pedido = null;
}

export function Titulo(t: string) {
  useEffect(() => {
    document.title = `${t} · NUPE`;
  }, [t]);
}
