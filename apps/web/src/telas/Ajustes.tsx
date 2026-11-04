import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { carregar, type MeView, type Settings } from "../lib/dados";
import { api, ApiError } from "../lib/http";
import { irPara } from "../lib/rotas";
import { Carregando, Falha } from "../componentes/comuns";
import { useDados } from "../lib/useDados";
import { registrarEnvio, marcarPendente } from "../lib/gravacao";

export function Ajustes({ me }: { me: MeView }) {
  const { fase, dados, erro, recarregar } = useDados(() => carregar.records(), []);
  const [form, setForm] = useState<Settings | null>(null);
  const [texto, setTexto] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const formRef = useRef<Settings | null>(null);
  const original = useRef<Settings | null>(null);
  formRef.current = form;
  if (dados) original.current = dados.settings;

  // Sair da tela sem clicar em "Salvar ajustes" não perde o que foi digitado.
  useEffect(() => {
    const sair = registrarEnvio(async () => {
      const atual = formRef.current;
      const antes = original.current;
      if (!atual || !antes) return;
      if (JSON.stringify(atual) === JSON.stringify(antes)) return;
      await api.put("/api/records/settings", atual);
    });
    return () => {
      sair();
      marcarPendente(false);
    };
  }, []);

  useEffect(() => {
    if (dados) setForm(dados.settings);
  }, [dados]);

  useEffect(() => {
    if (!form || !dados) return;
    marcarPendente(JSON.stringify(form) !== JSON.stringify(dados.settings));
  }, [form, dados]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setTexto("Salvando…");
    setErroSalvar("");
    try {
      await api.put("/api/records/settings", form);
      marcarPendente(false);
      setTexto(`Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (e2) {
      setErroSalvar(e2 instanceof ApiError ? e2.message : "Não foi possível salvar.");
      setTexto("");
    }
  }

  async function sair() {
    try {
      await api.post("/api/logout", {});
    } finally {
      marcarPendente(false);
      irPara("/entrar", true);
    }
  }

  if (fase === "carregando" || !form) return <Carregando />;
  if (fase === "erro") return <Falha texto={erro} aoTentar={recarregar} />;

  const mudar = (k: keyof Settings, v: string | number) => setForm((atual) => (atual ? { ...atual, [k]: v } : atual));

  return (
    <>
      <div className="cabeca">
        <div>
          <h1 className="titulo">Ajustes</h1>
          <p className="sub">Dados do estágio que aparecem no relatório e no cabeçalho. A conta de acesso é o e-mail que você usou na configuração.</p>
        </div>
      </div>

      <form className="form-ajustes" onSubmit={(e) => void salvar(e)}>
        <section className="ajuste">
          <div className="ajuste-rotulo">
            <h2 className="secao">Identificação</h2>
            <p className="legenda">Nome do núcleo e período analisado. O período entra no item 1 do relatório.</p>
          </div>
          <div className="ajuste-painel">
            <div className="campo">
              <label htmlFor="aj-nome">Nome exibido</label>
              <input id="aj-nome" className="input" value={form.displayName} onChange={(e) => mudar("displayName", e.target.value)} />
            </div>
            <div className="grade-2" style={{ marginTop: 14 }}>
              <div className="campo">
                <label htmlFor="aj-inicio">Início do estágio</label>
                <input id="aj-inicio" className="input" type="date" value={form.startDate} onChange={(e) => mudar("startDate", e.target.value)} />
              </div>
              <div className="campo">
                <label htmlFor="aj-fim">Previsão de término</label>
                <input id="aj-fim" className="input" type="date" value={form.endDate} onChange={(e) => mudar("endDate", e.target.value)} />
              </div>
            </div>
            <div className="grade-2" style={{ marginTop: 14 }}>
              <div className="campo">
                <label htmlFor="aj-supervisor">Supervisor(a)</label>
                <input id="aj-supervisor" className="input" value={form.supervisor} onChange={(e) => mudar("supervisor", e.target.value)} placeholder="[preencher]" />
              </div>
              <div className="campo">
                <label htmlFor="aj-curso">Curso</label>
                <input id="aj-curso" className="input" value={form.course} onChange={(e) => mudar("course", e.target.value)} placeholder="[preencher]" />
              </div>
            </div>
          </div>
        </section>

        <section className="ajuste">
          <div className="ajuste-rotulo">
            <h2 className="secao">Respostas</h2>
            <p className="legenda">Limite por endereço para evitar envios automatizados. Os questionários continuam anônimos.</p>
          </div>
          <div className="ajuste-painel">
            <div className="campo">
              <label htmlFor="aj-limite">Envios por hora de cada endereço</label>
              <input
                id="aj-limite"
                className="input"
                type="number"
                min={0}
                max={200}
                value={form.rateLimitPerHour}
                onChange={(e) => mudar("rateLimitPerHour", Number(e.target.value))}
              />
              <span className="dica">0 desliga o limite. Ajuste acima de 30 só se o auditório inteiro usar uma rede só.</span>
            </div>
          </div>
        </section>

        <div className="rodape-form">
          <button type="submit" className="btn primario">
            Salvar ajustes
          </button>
          <p className={erroSalvar ? "erro-texto" : "salvo"} role="status">
            {erroSalvar || texto}
          </p>
        </div>
      </form>

      <section className="painel" style={{ marginTop: 24 }}>
        <header>
          <h2 className="secao">Sessão</h2>
        </header>
        <div className="linha">
          <span>
            {me.name} <span className="meta">· {me.email}</span>
          </span>
          <button type="button" className="btn" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </section>

      <section className="painel" style={{ marginTop: 16 }}>
        <header>
          <h2 className="secao">Privacidade e dados</h2>
        </header>
        <div className="duas-colunas legenda">
          <p>
            O sistema não guarda nome, e-mail nem endereço de IP de quem responde. Para impedir envio repetido, o navegador recebe
            um identificador aleatório e o servidor guarda apenas um resumo criptográfico dele.
          </p>
          <p>
            Os dados ficam em um arquivo único no servidor, definido na instalação. Faça cópia de segurança desse arquivo antes de
            trocar de computador ou de publicar atualizações.
          </p>
        </div>
      </section>
    </>
  );
}
