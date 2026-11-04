import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../lib/http";
import { carregar } from "../lib/dados";
import { consulta, irPara } from "../lib/rotas";
import { Titulo, verificarConfiguracao } from "../lib/sessao";
import { Marca } from "../componentes/Icones";
import { Carregando } from "../componentes/comuns";

export function Entrar({ rota }: { rota: string }) {
  Titulo("Entrar");
  const [pronto, setPronto] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const voltarPara = consulta(rota).get("sair") || "/";

  useEffect(() => {
    let vivo = true;
    void verificarConfiguracao().then((precisa) => {
      if (!vivo) return;
      if (precisa) irPara("/configurar", true);
      // Já existe sessão válida: não faz sentido parar na tela de entrada.
      else
        void carregar
          .me()
          .then(() => irPara(voltarPara, true))
          .catch(() => setPronto(true));
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await api.post("/api/login", { email, password: senha });
      irPara(voltarPara, true);
    } catch (e2) {
      setErro(e2 instanceof ApiError ? e2.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  return (
    <main className="tela-aberta" id="conteudo">
      <div className="cartao-adm">
        <div className="cartao-marca">
          <Marca size={40} />
          <div>
            <div className="marca-nome">NUPE</div>
            <div className="marca-sub">Pesquisa e Extensão · UNEB Campus XXI</div>
          </div>
        </div>
        <h1 className="titulo">Entrar</h1>
        <p className="legenda" style={{ marginTop: 6, marginBottom: 22 }}>
          Área do estagiário. O acesso está limitado a você.
        </p>
        {!pronto ? (
          <Carregando />
        ) : (
          <form onSubmit={enviar} style={{ display: "grid", gap: 18 }}>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            {erro ? (
              <p className="erro-texto" role="alert">
                {erro}
              </p>
            ) : null}
            <button className="btn primario largo" type="submit" disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
        <p className="micro" style={{ marginTop: 26 }}>
          Esqueceu a senha? Peça ao responsável pela instalação para redefinir o acesso no servidor.
        </p>
      </div>
    </main>
  );
}

export function Configurar() {
  Titulo("Configuração inicial");
  const [pronto, setPronto] = useState(false);
  const [precisa, setPrecisa] = useState(true);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void verificarConfiguracao().then((p) => {
      if (!vivo) return;
      setPrecisa(p);
      setPronto(true);
      if (!p) irPara("/entrar", true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha !== repetir) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await api.post("/api/setup", { name: nome, email, password: senha });
      irPara("/", true);
    } catch (e2) {
      setErro(e2 instanceof ApiError ? e2.message : "Não foi possível concluir a configuração.");
      setEnviando(false);
    }
  }

  return (
    <main className="tela-aberta" id="conteudo">
      <div className="cartao-adm" style={{ maxWidth: 480 }}>
        <div className="cartao-marca">
          <Marca size={40} />
          <div>
            <div className="marca-nome">NUPE</div>
            <div className="marca-sub">Pesquisa e Extensão · UNEB Campus XXI</div>
          </div>
        </div>
        <h1 className="titulo">Primeira configuração</h1>
        <p className="legenda" style={{ marginTop: 6, marginBottom: 22 }}>
          Crie o acesso do estagiário. Esses dados ficam apenas no servidor e são usados para entrar na área interna.
        </p>
        {!pronto ? (
          <Carregando />
        ) : !precisa ? (
          <p className="legenda">A configuração já foi concluída.</p>
        ) : (
          <form onSubmit={enviar} style={{ display: "grid", gap: 18 }}>
            <div className="campo">
              <label htmlFor="nome">Seu nome</label>
              <input id="nome" className="input" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <span className="dica">Pelo menos 8 caracteres.</span>
              <input
                id="senha"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="repetir">Repita a senha</label>
              <input
                id="repetir"
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </div>
            {erro ? (
              <p className="erro-texto" role="alert">
                {erro}
              </p>
            ) : null}
            <button className="btn primario largo" type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Concluir configuração"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
