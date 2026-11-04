// Teste de ponta a ponta: fluxos principais, num navegador real.
// Uso: node scripts/e2e.mjs                      (sobe um servidor próprio e descartável)
//      node scripts/e2e.mjs http://host:porta    (usa um servidor já em execução)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { copyFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

/** Porta livre, para o teste não brigar com o servidor de desenvolvimento. */
function porta() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/**
 * Sobe uma cópia do servidor com dados descartáveis. Assim cada execução começa
 * sem respostas e sem os limites de tentativa do servidor de trabalho, e o
 * teste pode rodar várias vezes seguidas.
 */
async function servidorTemporario() {
  const livre = await porta();
  const dados = `${process.env.TEMP ?? "."}/nupe-e2e-${livre}.json`;
  copyFileSync("data/dev.json", dados);
  const filho = spawn(process.execPath, ["apps/api/dist/server.js"], {
    env: { ...process.env, PORT: String(livre), HOST: "127.0.0.1", NUPE_DATA: dados },
    stdio: "ignore",
  });
  const encerrar = () => {
    filho.kill();
    try {
      rmSync(dados, { force: true });
    } catch {}
  };
  const url = `http://127.0.0.1:${livre}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`${url}/api/public/health`);
      if (res.ok) return { url, encerrar };
    } catch {}
  }
  encerrar();
  throw new Error("servidor temporário não respondeu");
}

const argumento = process.argv[2];
const proprio = argumento ? null : await servidorTemporario();
const base = argumento ?? proprio.url;

/** O roteador troca de tela sem recarregar: espera a barra de endereço mudar. */
const esperarCaminho = (pagina, caminho) => pagina.waitForFunction((c) => window.location.pathname === c, caminho, { timeout: 20000 });
const esperarRota = (pagina, rota) => pagina.waitForFunction((r) => window.location.pathname + window.location.search === r, rota, { timeout: 20000 });

const email = process.argv[3] ?? "maria@exemplo.br";
const senha = process.argv[4] ?? "senha-teste-123";
const NUPE_LINK = /\/e\/[A-Za-z0-9_-]+/;

/** Responde tudo e envia, num navegador limpo (cada chamada gera um aparelho novo). */
async function responder(browser, link) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const q = await ctx.newPage();
  await q.goto(link);
  await q.waitForSelector(".q-cartao");
  const campos = q.locator("fieldset.q-cartao");
  const n = await campos.count();
  for (let i = 0; i < n; i++) {
    const p = campos.nth(i);
    const radios = p.locator("input[type=radio]");
    const checks = p.locator("input[type=checkbox]");
    if (await radios.count()) await radios.last().check();
    else if (await checks.count()) await checks.first().check();
    else await p.locator("textarea").fill("Resposta de teste automatizado, sem dados pessoais.");
  }
  await q.getByRole("button", { name: /Enviar respostas/ }).click();
  await q.waitForSelector("text=Resposta registrada", { timeout: 10000 });
  await ctx.close();
}

/** Envia respostas novas da equipe até a coleta ter o mínimo de 5 (percentuais liberados).
 *  Recebe uma função que devolve os cabeçalhos da sessão da estagiária. */
async function completarAmostra(browser, base, cabecalhos) {
  const ler = async (caminho) => (await fetch(`${base}${caminho}`, { headers: await cabecalhos() })).json();
  const { links } = await ler("/api/collections/links");
  if (!links.equipe) return -1;
  for (let i = 0; i < 12; i++) {
    const { summary } = await ler("/api/results/equipe");
    if (summary.total >= 5) return summary.total;
    await responder(browser, `${base}${links.equipe}`);
  }
  return -1;
}

const resultados = [];
function ok(nome, condicao, detalhe = "") {
  resultados.push({ nome, ok: Boolean(condicao), detalhe });
  if (!condicao) console.log(`FALHOU  ${nome} ${detalhe}`);
  else console.log(`ok      ${nome}`);
}

const browser = await chromium.launch();
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const pagina = await contexto.newPage();
const erros = [];
pagina.on("console", (m) => {
  if (m.type() === "error") erros.push(m.text());
});
pagina.on("pageerror", (e) => erros.push(String(e.message)));

try {
  // 1. Acesso
  await pagina.goto(`${base}/entrar`);
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha").fill(senha);
  await pagina.getByRole("button", { name: /^Entrar$/ }).click();
  await esperarCaminho(pagina, "/");
  // Depois do login, abrir /entrar volta ao painel em vez de mostrar a tela vazia.
  await pagina.goto(`${base}/entrar`);
  await esperarCaminho(pagina, "/");
  ok("sessão ativa dispensa a tela de acesso", true);

  // 2. Coletas: abrir a coleta de equipe (rascunho) e ler o link
  await pagina.goto(`${base}/coletas`);
  await pagina.waitForSelector(".coleta");
  const equipe = pagina.locator("section.coleta", { has: pagina.getByRole("heading", { name: "Equipe do NUPE" }) }).first();
  const estadoAntes = await equipe.locator(".estado").innerText();
  if (/Rascunho|Encerrada/.test(estadoAntes)) {
    await equipe.getByRole("button", { name: /Abrir coleta|Reabrir coleta/ }).click();
    await pagina.waitForSelector("text=Coleta de equipe do nupe aberta.");
  }
  const link = await equipe.getByLabel("Link do questionário").getAttribute("title");
  ok("coleta aberta gera link público", !!link && link.includes("/e/"), link ?? "");

  // 3. Copiar os links das coletas abertas
  await pagina.getByRole("button", { name: /Copiar links abertos/ }).click();
  await pagina.waitForSelector("text=/Links copiados|Não foi possível copiar/");
  const copiou = await pagina.locator("text=/Links copiados/").count();
  ok("copiar os links abertos", copiou > 0);

  // 4. Questionário público em outro contexto (navegador limpo)
  const publico = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const q = await publico.newPage();
  await q.goto(link);
  await q.waitForSelector(".q-cartao");
  ok("questionário abre no endereço do link", (await q.locator(".q-cartao").count()) === 8, `${await q.locator(".q-cartao").count()} perguntas`);

  // Enviar vazio: erro de validação
  await q.getByRole("button", { name: /Enviar respostas/ }).click();
  await q.waitForSelector("[role=alert]");
  ok("validação impede envio vazio", (await q.locator(".q-cartao.com-erro").count()) >= 5);

  // Responder tudo
  const perguntas = q.locator("fieldset.q-cartao");
  const total = await perguntas.count();
  for (let i = 0; i < total; i++) {
    const p = q.locator("fieldset.q-cartao").nth(i);
    const radios = p.locator("input[type=radio]");
    if ((await radios.count()) > 0) {
      await radios.nth((await radios.count()) - 1).check();
      continue;
    }
    const checks = p.locator("input[type=checkbox]");
    if ((await checks.count()) > 0) {
      await checks.nth(0).check();
      continue;
    }
    await p.locator("textarea").fill("Resposta de teste automatizado, sem dados pessoais.");
  }
  await q.getByRole("button", { name: /Enviar respostas/ }).click();
  await q.waitForSelector("text=Resposta registrada", { timeout: 10000 });
  ok("resposta enviada e confirmada", true);

  // Ao recarregar, o aparelho que já respondeu vê o aviso e não o formulário.
  await q.reload();
  await q.waitForSelector("text=Este aparelho já respondeu", { timeout: 10000 });
  ok("segundo acesso do mesmo aparelho é recusado", (await q.locator("fieldset.q-cartao").count()) === 0);
  await publico.close();

  // 5. Resultados da equipe: contagem subiu. A amostra é garantida pelo teste,
  // sem depender de respostas que já estivessem no arquivo de dados.
  const cookies = await contexto.cookies();
  const amostraFinal = await completarAmostra(browser, base, async () => ({
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-nupe-client": "web",
    origin: base,
  }));
  await pagina.goto(`${base}/resultados/equipe`);
  await pagina.waitForSelector(".amostra-num");
  const amostra = Number((await pagina.locator(".amostra-num").innerText()).replace(/\D/g, ""));
  ok("resultados refletem as respostas", amostra >= 5 && amostra === amostraFinal, `amostra ${amostra}`);

  // 6. Ficha 1: preencher missão e conferir o selo de salvo
  await pagina.goto(`${base}/fichas/1`);
  await pagina.waitForSelector(".folha");
  const missao = pagina.getByLabel("Missão");
  const novoTexto = `Apoiar pesquisa e extensão no DCHT XXI. ${Date.now()}`;
  const gravou = pagina.waitForResponse((r) => r.url().includes("/api/records/institution") && r.request().method() === "PUT");
  await missao.fill(novoTexto);
  await missao.blur();
  await pagina.waitForSelector("text=/Salvando|Salvo/", { timeout: 8000 });
  await gravou;
  await pagina.reload();
  await pagina.waitForSelector(".folha");
  const valorSalvo = await pagina.getByLabel("Missão").inputValue();
  ok("ficha 1 grava e recarrega", valorSalvo === novoTexto, valorSalvo.slice(0, 60));

  // 7. Ficha 3: criar fluxo pelo modelo
  await pagina.goto(`${base}/fichas/3`);
  await pagina.waitForSelector(".folha");
  const fluxosAntes = await pagina.locator("section.fluxo").count();
  await pagina.getByRole("button", { name: /Usar modelo/ }).click();
  await pagina.waitForFunction((n) => document.querySelectorAll("section.fluxo").length > n, fluxosAntes, { timeout: 8000 });
  ok("ficha 3 cria fluxo a partir do modelo", true);

  // 8. Matrizes: adicionar item em Porter
  await pagina.goto(`${base}/matrizes`);
  await pagina.waitForSelector(".porter-grade");
  const colClientes = pagina.locator(".porter-col").first();
  const antes = await colClientes.locator(".linha-matriz").count();
  const gravouPorter = pagina.waitForResponse((r) => r.url().includes("/api/records/matrices") && r.request().method() === "PUT");
  await colClientes.getByRole("button", { name: "Adicionar item" }).click();
  await colClientes.locator("textarea").last().fill("Estudantes da graduação do campus.");
  await colClientes.locator("textarea").last().blur();
  await gravouPorter;
  await pagina.reload();
  await pagina.waitForSelector(".porter-grade");
  const linhasPorter = await pagina.locator(".porter-col").first().locator(".linha-matriz").count();
  ok("matriz de Porter grava", linhasPorter === antes + 1, `${antes} antes, ${linhasPorter} depois`);

  // 9. Relatório: Word baixa e versão de impressão responde
  await pagina.goto(`${base}/relatorio`);
  await pagina.waitForSelector(".rel-doc");
  const secNum = await pagina.locator(".rel-doc .rel-sec > h2").count();
  ok("relatório tem as 9 seções numeradas", secNum >= 9, `${secNum} seções, 9 numeradas`);
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.getByRole("button", { name: "Baixar Word" }).click()]);
  ok("download do Word", (await download.suggestedFilename()).endsWith(".doc"), download.suggestedFilename());
  const doc = await pagina.request.get(`${base}/api/report/document`);
  const corpo = await doc.text();
  ok("versão de impressão responde em HTML", doc.ok() && corpo.includes("Relatório de diagnóstico"), `${doc.status()}`);

  // 10. Ajustes: salvar e sair
  await pagina.goto(`${base}/ajustes`);
  await pagina.waitForSelector("#aj-supervisor");
  await pagina.getByLabel("Supervisor(a)").fill("Coordenação do NUPE");
  await pagina.getByRole("button", { name: "Salvar ajustes" }).click();
  await pagina.waitForSelector("text=/Salvo às/", { timeout: 8000 });
  ok("ajustes salvam", true);
  await pagina.getByRole("button", { name: "Sair" }).click();
  // O roteador troca a tela sem recarregar; espera a barra de endereço mudar.
  await pagina.waitForFunction(() => window.location.pathname === "/entrar", null, { timeout: 15000 });
  ok("sair encerra a sessão", true);

  // 11. Sem sessão, a área interna redireciona
  await pagina.goto(`${base}/fichas/2`);
  await pagina.waitForFunction(() => window.location.pathname === "/entrar", null, { timeout: 15000 });
  await pagina.waitForSelector("#email", { timeout: 15000 });
  ok("área interna exige sessão", true);

  // 12. Acesso pela tecla Tab: o primeiro Tab mostra "Ir para o conteúdo" e leva ao <main>.
  await pagina.goto(`${base}/entrar`);
  await pagina.waitForSelector("#email");
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha").fill(senha);
  await pagina.getByRole("button", { name: /^Entrar$/ }).click();
  await esperarCaminho(pagina, "/");
  await pagina.keyboard.press("Tab");
  const atalho = await pagina.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  ok("primeiro Tab alcança o atalho de conteúdo", /Ir para o conteúdo/i.test(atalho), atalho);
  await pagina.keyboard.press("Enter");
  const focoNoConteudo = await pagina.evaluate(() => document.activeElement?.id ?? "");
  ok("atalho leva o foco ao conteúdo", focoNoConteudo === "conteudo", focoNoConteudo);

  // 13. Tamanho do texto: o controle grava a escolha no navegador.
  await pagina.getByRole("button", { name: "Tamanho do texto: muito grande" }).click();
  const tamanho = await pagina.evaluate(() => document.documentElement.dataset.texto ?? "");
  const guardado = await pagina.evaluate(() => localStorage.getItem("nupe-texto") ?? "");
  ok("controle de tamanho do texto é guardado", tamanho !== "" && guardado === tamanho, `${tamanho} / ${guardado}`);

  // 14. Menu do telefone: botão abre a navegação e Escape fecha.
  const telefone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tela = await telefone.newPage();
  await tela.goto(`${base}/entrar`);
  await tela.getByLabel("E-mail").fill(email);
  await tela.getByLabel("Senha").fill(senha);
  await tela.getByRole("button", { name: /^Entrar$/ }).click();
  await tela.waitForFunction(() => window.location.pathname === "/", null, { timeout: 20000 });
  await tela.waitForSelector(".nav-inferior");
  await tela.getByRole("button", { name: "Menu" }).click();
  const menuAberto = await tela.locator(".sidebar.aberta").count();
  await tela.keyboard.press("Escape");
  await tela.waitForTimeout(300);
  const menuFechado = (await tela.locator(".sidebar.aberta").count()) === 0;
  ok("menu do telefone abre e fecha com Escape", menuAberto === 1 && menuFechado);
  const rolagem = await tela.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("tela do telefone não rola na horizontal", rolagem <= 0, `sobra de ${rolagem}px`);
  await telefone.close();
} catch (e) {
  ok("execução sem exceção", false, e.message);
  writeFileSync("capturas/e2e-falha.txt", `${e.stack ?? e.message}\n`);
  await pagina.screenshot({ path: "capturas/falha-e2e.png", fullPage: true }).catch(() => {});
}

ok("sem erros de console (exceto fontes ausentes e /api/me sem sessão)", erros.filter((e) => !/font|OTS|401 \(Unauthorized\)/i.test(e)).length === 0, erros.join(" | ").slice(0, 300));

const falhas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length} verificações passaram.`);
await browser.close();
proprio?.encerrar();
process.exit(falhas ? 1 : 0);

