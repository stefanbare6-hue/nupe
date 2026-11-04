/**
 * Gravação pendente das fichas, ajustes e matrizes.
 *
 * A tela migra do antigo para o novo roteador sem recarregar a página, então
 * `beforeunload` não avisa. Quem tem edição ainda não enviada ao servidor
 * registra aqui e a navegação é bloqueada até a gravação terminar.
 */
let pendente = false;
const esperas = new Set<() => Promise<void>>();

/** Marca que existe alteração aguardando envio. */
export function marcarPendente(valor: boolean) {
  pendente = valor;
}

export function haPendencia(): boolean {
  return pendente || esperas.size > 0;
}

/** Registra como enviar o que está pendente agora. Devolve a função de remover. */
export function registrarEnvio(enviar: () => Promise<void>) {
  const registro = async () => {
    if (esperas.has(registro)) await enviar();
  };
  esperas.add(registro);
  return () => {
    esperas.delete(registro);
  };
}

/** Envia tudo o que estiver registrado antes de trocar de tela. */
export async function aguardarGravacao() {
  if (!haPendencia()) return;
  await Promise.all([...esperas].map((enviar) => enviar().catch(() => undefined)));
}
