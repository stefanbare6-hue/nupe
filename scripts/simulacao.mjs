// Simulação completa do uso: responde os três questionários num aparelho limpo,
// preenche as 8 fichas e as matrizes como uma estagiária faria, e tira capturas
// do painel, das coletas, dos resultados e do relatório — no computador e no
// telefone. Uso: node scripts/simulacao.mjs [base]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3333";
const saida = "capturas/simulacao";
mkdirSync(saida, { recursive: true });
const EMAIL = "maria@exemplo.br";
const SENHA = "senha-teste-123";

const browser = await chromium.launch();
const erros = [];
const vigiar = (page) => {
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/401/.test(m.text())) erros.push(`console: ${m.text()}`);
  });
};
const pausa = (page, ms = 500) => page.waitForTimeout(ms);

// ───────────────────── links públicos ─────────────────────
async function linksPublicos() {
  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nupe-client": "web", origin: base },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const dados = await (await fetch(`${base}/api/dashboard`, { headers: { cookie } })).json();
  // Coleta nova nasce em rascunho: a estagiária abre cada uma antes de divulgar.
  for (const c of dados.collections) {
    if (c.status !== "aberta" || !c.publicId) {
      const r = await fetch(`${base}/api/collections/${c.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-nupe-client": "web", origin: base, cookie },
        body: JSON.stringify({ status: "aberta" }),
      });
      if (!r.ok) throw new Error(`abrir ${c.audience}: ${r.status} ${await r.text()}`);
    }
  }
  const abertas = await (await fetch(`${base}/api/dashboard`, { headers: { cookie } })).json();
  const por = Object.fromEntries(abertas.collections.map((c) => [c.audience, c.publicId]));
  if (Object.values(por).some((v) => !v)) throw new Error(`sem link público: ${JSON.stringify(por)}`);
  return ["docentes", "estudantes", "equipe"].map((a) => `/e/${por[a]}`);
}

// ───────────────────── respostas públicas ─────────────────────
const notas = {
  docentes: [4, 4, 3, 4, 3, 2, 4, 3],
  estudantes: [3, 2, 3, 4, 3, 2, 4, 3],
  equipe: [4, 3, 2, 4, 3, 3, 4, 2],
};
const abertas = {
  docentes: "Tenho dificuldade de acompanhar os editais abertos; hoje descubro por colegas e pelo grupo do curso.",
  estudantes: "O NUPE aparece nos slides de boas-vindas, mas nunca vi uma ação dentro do curso.",
  equipe: "Os dados dos projetos ficam em planilhas diferentes, o que atrasa os relatórios do semestre.",
};

async function responder(link, publico) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-BR" });
  const q = await ctx.newPage();
  vigiar(q);
  await q.goto(base + link);
  await q.waitForSelector("fieldset.q-cartao", { timeout: 20000 });
  await q.screenshot({ path: `${saida}/q-${publico}-1-inicio-390.png` });
  const campos = q.locator("fieldset.q-cartao");
  const n = await campos.count();
  for (let i = 0; i < n; i++) {
    const p = campos.nth(i);
    const radios = p.locator("input[type=radio]");
    const checks = p.locator("input[type=checkbox]");
    if ((await radios.count()) > 0) {
      const total = await radios.count();
      await radios.nth(Math.min(Math.max((notas[publico][i] ?? 3) - 1, 0), total - 1)).check();
    } else if ((await checks.count()) > 0) {
      await checks.first().check();
    } else {
      const texto = p.locator("textarea, input:not([type=radio]):not([type=checkbox])");
      if (await texto.count()) await texto.first().fill(abertas[publico]);
    }
  }
  await q.screenshot({ path: `${saida}/q-${publico}-2-preenchido-390.png`, fullPage: true });
  await q.getByRole("button", { name: /Enviar respostas/ }).click();
  await q.waitForSelector("text=Resposta registrada", { timeout: 20000 });
  await q.screenshot({ path: `${saida}/q-${publico}-3-obrigado-390.png` });
  await q.reload();
  await q.waitForSelector("text=Este aparelho já respondeu", { timeout: 20000 });
  await q.screenshot({ path: `${saida}/q-${publico}-4-ja-respondeu-390.png` });
  await ctx.close();
  console.log("respondeu:", publico);
}

// ───────────────────── sessão da estagiária ─────────────────────
async function sessao(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  vigiar(page);
  await page.goto(`${base}/entrar`);
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
  return { ctx, page };
}

/** Preenche o campo que tem exatamente este rótulo de acessibilidade. */
async function preencher(page, rotulo, texto) {
  if (typeof texto !== "string") throw new Error(`texto ausente para "${rotulo}"`);
  const campo = page.locator(`[aria-label=${JSON.stringify(rotulo)}]`).first();
  if (!(await campo.count())) {
    console.warn(`  (sem campo) ${rotulo}`);
    return;
  }
  const tipo = await campo.getAttribute("type");
  if (tipo === "date") {
    await campo.evaluate((el, valor) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, texto);
  } else {
    await campo.fill(texto);
  }
  await campo.blur();
  await pausa(page);
}

/** Preenche o campo cujo rótulo começa/termina com o texto dado. */
async function preencherPadrao(page, padrao, texto) {
  const campo = page.getByLabel(padrao).first();
  if (!(await campo.count())) {
    console.warn(`  (sem campo) ${padrao}`);
    return;
  }
  await campo.fill(texto);
  await campo.blur();
  await pausa(page);
}

const links = await linksPublicos();
console.log("links:", links.join(" "));
for (let i = 0; i < links.length; i++) await responder(links[i], ["docentes", "estudantes", "equipe"][i]);

const { ctx, page } = await sessao({ width: 1440, height: 900 });
const foto = async (nome, inteira = false) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${saida}/${nome}.png`, fullPage: inteira });
};
const abrir = async (rota, ms = 900) => {
  await page.goto(`${base}${rota}`);
  await pausa(page, ms);
};

await abrir("/", 1200);
await foto("01-painel-1440");
await abrir("/coletas");
await foto("02-coletas-1440");

// ───── ficha 1 ─────
await abrir("/fichas/1");
const ficha1 = [
  ["Missão", "Aproximar a universidade do município pelo acompanhamento de projetos de pesquisa e extensão no Campus XXI."],
  ["Visão", "Ser referência em extensão universitária no Território Médio Rio de Contas até 2028."],
  ["Valores", "Escuta, registro público do que se faz e compromisso com o retorno à comunidade."],
  ["Quem coordena", "Uma coordenação docente, com apoio de dois professores colaboradores."],
  ["Estrutura organizacional", "Coordenação, professores colaboradores, bolsistas de extensão e o colegiado do DCHT XXI."],
  ["Estilo de liderança", "Participativo: as decisões passam pelo colegiado e pelos bolsistas."],
];
for (const [rotulo, texto] of ficha1) await preencher(page, rotulo, texto);
await foto("03-ficha1-1440", true);

// ───── ficha 2 ─────
await abrir("/fichas/2");
const indicadores = ["Projetos de extensão ativos", "Projetos de pesquisa ativos", "Bolsistas", "Editais por ano", "Públicos atendidos"];
const numeros = [
  ["6", "Relatório de gestão 2025 do campus"],
  ["9", "Relatório de gestão 2025 do campus"],
  ["12", "Edital PROEX 2025"],
  ["3", "Painel de editais da PROEX"],
  ["480", "Relatórios dos projetos de extensão"],
];
for (let i = 0; i < indicadores.length; i++) {
  await preencher(page, `${indicadores[i]}, Valor`, numeros[i][0]);
  await preencher(page, `${indicadores[i]}, Fonte e ano`, numeros[i][1]);
}
await foto("04-ficha2-1440");

// ---- ficha 3 ----
await abrir("/fichas/3");
await page.getByRole("button", { name: /Usar modelo: Pagamento da bolsa de monitoria/ }).click();
await pausa(page, 2000);
const fluxo = "Pagamento da bolsa de monitoria de extensão (1)";
const etapas = [
  ["Divulgação do edital", "Coordenação do NUPE", "Site da PROEX", "Fevereiro", ""],
  ["Inscrição e seleção", "Professores colaboradores", "Formulário online", "Março", "Poucos candidatos com disponibilidade no contraturno"],
  ["Comunicação do resultado", "Coordenação do NUPE", "E-mail institucional", "Março", "Estudantes não checam o e-mail institucional"],
  ["Registro no SISPROEX", "Bolsistas", "SISPROEX", "Mensal", "Sistema fora do ar nos dias de fechamento"],
  ["Pagamento da bolsa", "Pró-reitoria de Gestão e Desenvolvimento de Pessoas", "SISPROEX e folha", "Mensal", "Atraso quando o relatório não é aprovado"],
];
for (let i = 0; i < etapas.length; i++) {
  const linha = `${fluxo}, etapa ${i + 1}`;
  await preencher(page, `${linha}, Etapa`, etapas[i][0]);
  await preencher(page, `${linha}, Quem faz`, etapas[i][1]);
  await preencher(page, `${linha}, Documento ou sistema`, etapas[i][2]);
  await preencher(page, `${linha}, Prazo`, etapas[i][3]);
  if (etapas[i][4]) await preencher(page, `${linha}, Onde trava`, etapas[i][4]);
}
await foto("05-ficha3-1440", true);

// ---- ficha 4 ----
await abrir("/fichas/4");
const camposSistema = ["Nome e finalidade", "Quem usa", "O que entra (dados e documentos)", "O que sai (relatórios e registros)", "Dúvidas e erros mais comuns", "Quem dá suporte"];
// A ficha já abre com dois blocos de sistema (com o nome sugerido): renomeia
// os dois primeiros e preenche os campos, cujo rótulo usa o nome como prefixo.
const nomesSistema = ["SISPROEX — registro de projetos de extensão", "Sistema de iniciação científica [confirmar o nome]"];
const dadosSistema = [
  ["Registro dos projetos de extensão do campus, do plano de trabalho ao relatório final.", "Coordenação do NUPE e bolsistas", "Dados do projeto, plano de trabalho, relatórios parciais e comprovantes.", "Relatórios de extensão e histórico do projeto para a PROEX.", "Esquecem de anexar o comprovante e o sistema recusa o envio perto do prazo.", "PROEX — Coordenação de Extensão"],
  ["Acompanhamento dos bolsistas de iniciação científica do campus.", "Professores orientadores e bolsistas de IC", "Plano de trabalho, relatórios semestrais e certificados.", "Pareceres e certificados de participação.", "O nome exato do sistema ainda não foi confirmado; a dúvida está no diário de campo.", "Pró-Reitoria de Pós-Graduação e Pesquisa"],
];
for (let s = 0; s < nomesSistema.length; s++) {
  const nome = nomesSistema[s];
  const campoNome = page.locator('[aria-label="Nome do sistema"]').nth(s);
  await campoNome.fill(nome);
  await campoNome.blur();
  await pausa(page, 1200);
  for (let c = 0; c < camposSistema.length; c++) {
    await preencher(page, `${nome}, ${camposSistema[c]}`, dadosSistema[s][c]);
  }
}
await foto("06-ficha4-1440", true);
// Recorte do cabeçalho do bloco: é onde o botão de remover ficava espremido.
const bloco = page.locator(".sistema").first();
await bloco.scrollIntoViewIfNeeded();
await page.mouse.move(0, 0);
await bloco.screenshot({ path: `${saida}/06b-ficha4-cabecalho-1440.png` });

// ---- ficha 5 ----
await abrir("/fichas/5");
const procedimentos = [
  ["Seleção de projetos e bolsistas", "Edital 02/2026 da PROEX", "Coordenação do NUPE", "Aberto até março"],
  ["Registro e acompanhamento de projetos", "Resolução 1.234/2024 da UNEB", "Bolsista responsável", "Mensal"],
  ["Pagamento de bolsas", "Resolução 1.234/2024 e manual de gestão de pessoas", "Pró-reitoria de Gestão e Desenvolvimento de Pessoas", "Mensal"],
  ["Relatórios de projetos", "Edital 02/2026 da PROEX", "Colegiado do DCHT XXI", "Até 60 dias após o encerramento"],
];
for (const [nome, base, quem, prazo] of procedimentos) {
  if (base) await preencher(page, `${nome}, Base normativa`, base);
  await preencher(page, `${nome}, Responsável`, quem);
  await preencher(page, `${nome}, Prazo`, prazo);
}
await foto("07-ficha5-1440", true);

// ---- ficha 6 ----
await abrir("/fichas/6");
await preencher(page, "Ideia de melhoria", "Padronizar o registro dos projetos em uma única planilha compartilhada, com um checklist por etapa.");
const w2h = [
  ["O quê", "Planilha única de acompanhamento, com checklist de cada etapa do projeto."],
  ["Por quê", "Hoje os dados ficam em arquivos diferentes e o relatório do semestre atrasa."],
  ["Quem", "Coordenação do NUPE, com os bolsistas."],
  ["Onde", "Pasta compartilhada do núcleo e SISPROEX."],
  ["Quando", "No início da próxima seleção, em fevereiro."],
  ["Como", "Modelo pronto, uma aba por projeto e revisão mensal."],
  ["Quanto", "Sem custo: usa apenas ferramentas já disponíveis."],
];
for (const [rotulo, texto] of w2h) await preencher(page, rotulo, texto);
const pdca = [
  ["Planejar", "Montar o modelo da planilha e definir o checklist com a coordenação."],
  ["Fazer", "Preencher a planilha com os projetos vigentes e treinar os bolsistas."],
  ["Checar", "Revisar mensalmente se cada projeto tem as etapas e os comprovantes."],
  ["Ajustar", "Corrigir o modelo conforme as dúvidas que aparecerem no uso."],
];
for (const [rotulo, texto] of pdca) await preencher(page, rotulo, texto);
await foto("08-ficha6-1440", true);

// ---- ficha 7 ----
await abrir("/fichas/7");
const diario = [
  ["2026-09-02", "Conversa com a coordenação: os editais de extensão saem em fevereiro, mas o aviso chega ao noturno só em março.", "Conversa com a coordenação do NUPE", "O aviso pode ser enviado direto pelas coordenações de curso?"],
  ["2026-09-09", "Consulta ao relatório de gestão 2025: 6 projetos de extensão e 9 de pesquisa ativos no campus.", "Relatório de gestão 2025 do campus", "De onde vem o número de públicos atendidos?"],
  ["2026-09-16", "Observação no SISPROEX: o sistema recusa o envio do relatório quando falta o comprovante anexado.", "Tela do SISPROEX", "Esse bloqueio está em algum manual?"],
];
for (let i = 0; i < diario.length; i++) {
  await page.getByRole("button", { name: /Adicionar registro/i }).first().click();
  await pausa(page, 1000);
  const r = `registro ${i + 1}`;
  await preencher(page, `${r}, Data`, diario[i][0]);
  await preencher(page, `${r}, O que observei`, diario[i][1]);
  await preencher(page, `${r}, Fonte (documento, sistema ou conversa)`, diario[i][2]);
  await preencher(page, `${r}, Dúvida que ficou`, diario[i][3]);
}
await foto("09-ficha7-1440", true);

// ---- ficha 8 ----
await abrir("/fichas/8");
const glossario = [
  [2, "Departamento de Ciências Humanas e Tecnologias do Campus XXI", "Site do campus"],
  [3, "Sistema de registro de projetos de extensão da UNEB", "Tela do SISPROEX"],
];
for (const [n, significado, fonte] of glossario) {
  await preencher(page, `verbete ${n}, Significado`, significado);
  await preencher(page, `verbete ${n}, Fonte`, fonte);
}
await foto("10-ficha8-1440", true);

// ---- matrizes: Porter ----
await abrir("/matrizes", 1400);
const porter = [
  ["Clientes", [["Docentes do Campus XXI", "Ficha 1"], ["Estudantes de graduação do campus", "Respostas dos estudantes"]]],
  ["Fornecedores", [["Pró-reitoria de Extensão (PROEX)", "Ficha 5"], ["Direção do DCHT XXI", "Ficha 1"]]],
  ["Concorrentes", [["Outros núcleos do campus", "Conversa com a coordenação"]]],
  ["Novos entrantes", [["Ligas acadêmicas", "Observação no campus"]]],
  ["Substitutos", [["Grupos de pesquisa que buscam editais por conta própria", "Conversa com docentes"]]],
];
for (const [bloco, itens] of porter) {
  const caixa = page.locator(".porter-col").filter({ has: page.getByRole("heading", { name: bloco, exact: true }) });
  for (let i = 0; i < itens.length; i++) {
    await caixa.getByRole("button", { name: /Adicionar item/i }).first().click();
    await pausa(page, 900);
    await preencher(page, `${bloco}, item ${i + 1}`, itens[i][0]);
    await preencher(page, `${bloco}, evidência do item ${i + 1}`, itens[i][1]);
  }
}
await foto("11-matrizes-porter-1440", true);

// ---- matrizes: SWOT ----
const swot = [
  ["Forças", ["Equipe próxima dos estudantes", "Boa relação com as escolas do município"]],
  ["Fraquezas", ["Registro disperso em planilhas", "Pouca divulgação das ações"]],
  ["Oportunidades", ["Editais de extensão abertos", "Parcerias com a rede pública de Ipiaú"]],
  ["Ameaças", ["Poucos bolsistas com disponibilidade no contraturno"]],
];
for (const [nome, itens] of swot) {
  const caixa = page.locator(".swot-col").filter({ has: page.getByRole("heading", { name: new RegExp(`^${nome}`) }) });
  for (let i = 0; i < itens.length; i++) {
    await caixa.getByRole("button", { name: /Adicionar item/i }).first().click();
    await pausa(page, 900);
    await preencher(page, `${nome}, item ${i + 1}`, itens[i]);
  }
}
await foto("12-matrizes-swot-1440", true);

// ---- matrizes: GUT ----
const gut = page.locator("section[aria-labelledby='gut-t']");
const gargalos = [
  ["Aviso de edital chega tarde ao noturno", "Diário de campo, registro 1", "4", "5", "3"],
  ["Falta de comprovante anexado no SISPROEX", "Ficha 4", "3", "4", "2"],
];
for (let i = 0; i < gargalos.length; i++) {
  await gut.getByRole("button", { name: /Adicionar gargalo/i }).first().click();
  await pausa(page, 1200);
  await preencher(page, `Gargalo da linha ${i + 1}`, gargalos[i][0]);
  await preencher(page, `Origem da linha ${i + 1}`, gargalos[i][1]);
  await page.locator(`[aria-label="Gravidade da linha ${i + 1}"]`).selectOption(gargalos[i][2]);
  await pausa(page, 600);
  await page.locator(`[aria-label="Urgência da linha ${i + 1}"]`).selectOption(gargalos[i][3]);
  await pausa(page, 600);
  await page.locator(`[aria-label="Tendência da linha ${i + 1}"]`).selectOption(gargalos[i][4]);
  await pausa(page, 700);
}
await foto("13-matrizes-gut-1440", true);

// ───── resultados ─────
for (const publico of ["docentes", "estudantes", "equipe"]) {
  await abrir(`/resultados/${publico}`, 1100);
  await foto(`14-resultados-${publico}-1440`, true);
}

// ───── relatório ─────
await abrir("/relatorio", 1400);
await foto("15-relatorio-1440", true);
const baixar = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
await page.getByRole("button", { name: /Baixar Word/ }).click();
const arquivo = await baixar;
if (arquivo) {
  await arquivo.saveAs(`${saida}/relatorio-nupe.doc`);
  console.log("Word:", arquivo.suggestedFilename());
}

// ───── telefone: as mesmas fichas e uma resposta do questionário ─────
const cel = await sessao({ width: 390, height: 844 });
const m = cel.page;
await m.goto(`${base}/fichas/4`);
await pausa(m, 1000);
await m.mouse.move(0, 0);
await m.screenshot({ path: `${saida}/16-telefone-ficha4.png` });
const blocoM = m.locator(".sistema").first();
await blocoM.scrollIntoViewIfNeeded();
await m.mouse.move(0, 0);
await blocoM.screenshot({ path: `${saida}/16b-telefone-ficha4-cabecalho.png` });
for (const [n, rota] of [[1, "/fichas/1"], [2, "/fichas/2"], [3, "/fichas/3"], [6, "/fichas/6"], [7, "/fichas/7"], [8, "/fichas/8"], ["m", "/matrizes"], ["r", "/resultados/equipe"], ["rel", "/relatorio"]]) {
  await m.goto(`${base}${rota}`);
  await pausa(m, 1000);
  await m.mouse.move(0, 0);
  await m.screenshot({ path: `${saida}/17-telefone-${n}.png` });
}
await cel.ctx.close();

console.log(erros.length ? `erros de página:\n${erros.join("\n")}` : "sem erros de página em console");
await browser.close();
ctx.close().catch(() => {});
process.exit(erros.length ? 1 : 0);

