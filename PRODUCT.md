# NUPE: sistema de estágio

Aplicação web para o estágio no NUPE (Núcleo de Pesquisa e Extensão), UNEB Campus XXI, DCHT XXI, Ipiaú. Ela cobre o ciclo inteiro do estágio:

1. coleta anônima de respostas de três públicos (docentes, estudantes e equipe do NUPE);
2. painel de resultados com contagem, percentuais e temas das respostas abertas;
3. oito fichas de campo editáveis, com gravação automática;
4. guia de matrizes (Porter, SWOT, 5W2H e PDCA) só para leitura;
5. relatório de diagnóstico em nove seções, exportável em Word e PDF.

Todo o texto da interface está em português do Brasil.

## Quem usa o quê

| Pessoa | Como entra | O que vê |
| --- | --- | --- |
| Estagiária(o) | e-mail e senha, em `/entrar` | painel, coletas, resultados, fichas, matrizes, relatório e ajustes |
| Docentes, estudantes, equipe | link público da coleta, sem cadastro | o questionário do seu público |

O link público tem a forma `https://SEU-ENDEREÇO/e/CODIGO`. Cada público tem um link próprio e cada versão nova de coleta gera um link novo.

## Regras que o sistema garante

**Anonimato.** O questionário não pede nome, e-mail, telefone nem curso da pessoa. O sistema não guarda endereço IP: para impedir envio repetido do mesmo aparelho ele guarda apenas um HMAC de um identificador aleatório criado no navegador. Visitas ao link são contadas por dia, em número, sem identificação.

**Amostra pequena.** Percentuais e médias só aparecem com 5 respostas ou mais. Abaixo disso a tela mostra "amostra pequena" e a contagem bruta. A regra está em `packages/core/src/stats.ts`.

**Respostas abertas por tema.** Cada resposta aberta recebe uma sugestão de tema por palavras-chave. A sugestão é editável na tela de resultados: a estagiária pode corrigir o tema de qualquer resposta.

**Fichas de campo.** As células vazias aparecem como `[preencher]`. A gravação é automática ao sair do campo; um selo mostra a hora do último salvamento. Linhas podem ser acrescentadas ou removidas nas fichas 4, 7 e 8; a ficha 3 aceita novos fluxos, inclusive a partir de um modelo.

**Relatório sem invenção.** Cada afirmação do relatório aponta a evidência de onde veio (ficha, matriz ou módulo de resultados). Campo vazio vira `[preencher]`, nunca um número inventado. O relatório lista no fim todos os campos que faltam, divididos por ficha.

**Demonstração fictícia.** O botão "Demonstração" do painel carrega respostas e coletas fictícias, marcadas visualmente como tais. Esses dados ficam fora das contagens, dos resultados, dos temas e do relatório. O botão "Remover dados fictícios" apaga tudo de uma vez.

## Como rodar

Requisitos: Node.js 20 ou mais recente.

```bash
npm install
npm run build
npm start
```

O servidor sobe em `http://localhost:3333` servindo a API e a interface. No primeiro acesso, `/configurar` pede nome, e-mail e senha (mínimo de 8 caracteres) da conta da estagiária. Depois o acesso é por `/entrar`.

Variáveis de ambiente:

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PORT` | `3333` | porta HTTP |
| `HOST` | `0.0.0.0` | interface de rede |
| `NUPE_DATA` | `data/nupe.json` | arquivo onde ficam todos os dados |
| `NUPE_SECRET` | valor de desenvolvimento | chave que assina cookie de sessão e HMAC do anti-repetição; **troque em produção** |
| `NUPE_BEHIND_PROXY` | desligado | `1` quando há um proxy (nginx, Caddy) na frente, para ler o IP real |
| `NUPE_WEB_DIST` | `apps/web/dist` | pasta da interface compilada |
| `LOG_LEVEL` | desligado | nível de log do Fastify |

### Durante o desenvolvimento

```bash
npm run build            # core, API e interface
npm test                 # testes unitários e de API (vitest)
npm run typecheck        # checagem de tipos de tudo
npm run e2e              # teste de ponta a ponta no navegador (Playwright)
npm run capturar         # capturas de tela em capturas/, em três larguras
npm run reiniciar        # reinicia o servidor local com data/dev.json
```

Ordem importa: `npm run build -w @nupe/core` precisa rodar antes da API porque a API e os testes resolvem `@nupe/core` a partir de `dist`. O `npm run build` já faz nessa ordem.

O `npm run e2e` sobe sozinho um servidor descartável numa porta livre, com uma cópia temporária dos dados, e o encerra no fim, então pode rodar várias vezes seguidas sem esbarrar nos limites de tentativa. Para apontá-lo a um servidor já em execução, passe a URL: `node scripts/e2e.mjs http://localhost:3333`. Já o `npm run capturar` precisa do servidor de trabalho em `http://localhost:3333`, com a conta de teste `maria@exemplo.br` e a senha `senha-teste-123` (o usuário do `data/dev.json`); use `npm run reiniciar` antes se o limite de login (8 tentativas a cada 10 minutos) já tiver sido atingido.

## Publicar na internet

O sistema é um único processo Node que já serve a interface. Publicar significa pôr esse processo atrás de HTTPS.

1. **Servidor.** Uma máquina (VPS ou similar) com Node 20 e um domínio apontando para ela.
2. **Chave secreta.** Gere uma chave longa e guarde fora do repositório:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Use como `NUPE_SECRET`.
3. **HTTPS.** Na frente do Node, use Caddy (certificado automático) ou nginx com certificado Let's Encrypt. Exemplo de Caddy:
   ```
   nupe.seu-dominio.br {
     reverse_proxy 127.0.0.1:3333
   }
   ```
   Com proxy, defina `NUPE_BEHIND_PROXY=1` para que os limites por endereço usem o IP real. O cookie de sessão já é enviado apenas sobre HTTPS quando o endereço público usa `https`.
4. **Processo.** Use `pm2`, `systemd` ou `docker` para manter `node apps/api/dist/server.js` de pé e reiniciar após reiniciar a máquina.
5. **Cópia de segurança.** Todos os dados estão em um único arquivo JSON (`NUPE_DATA`), gravado de forma atômica. Copie o arquivo diariamente, por exemplo com `cron`:
   ```
   0 3 * * * cp /srv/nupe/data/nupe.json /srv/nupe/backups/nupe-$(date +\%F).json
   ```
   Para restaurar, pare o servidor, troque o arquivo e suba de novo.
6. **Distribuir os links.** Abra `/coletas`, confira o link de cada público e use "Copiar links abertos". O sistema não envia mensagens sozinho: a divulgação é por WhatsApp, e-mail para a coordenação, grupos de turma ou a própria equipe do núcleo.

Cuidados de operação:

- fechar a coleta quando parar de divulgar, para que as respostas recebidas correspondam ao período do relatório;
- abrir uma nova versão quando o questionário mudar, porque assim os dados antigos ficam separados;
- remover o conjunto de demonstração antes de gerar o relatório definitivo.

## Privacidade e limites de uso

- Nenhum dado pessoal de respondente é coletado ou gravado.
- Senha da estagiária guardada com `scrypt` e sal por usuário.
- Sessão em cookie `HttpOnly`, `SameSite=Strict`; toda escrita exige o cabeçalho `x-nupe-client: web` e mesma origem (proteção contra CSRF).
- Envio público limitado por aparelho (8 a cada 10 minutos) e por endereço (200 a cada 10 minutos), com um voucher assinado que expira. Os limites são altos de propósito: uma turma inteira pode responder pelo mesmo Wi-Fi.
- Uma tentativa de login, 8 a cada 10 minutos por endereço.
- Respostas abertas passam por limpeza de caracteres de controle e têm tamanho limitado.

## Estrutura de pastas

```
apps/api        Fastify: rotas públicas e internas, armazenamento, autenticação
apps/web        React + Vite: telas, componentes e estilo
packages/core   regras compartilhadas: questionários, estatística, matrizes, relatório
scripts         teste de ponta a ponta, capturas de tela, reinício do servidor local
data            arquivo de dados (o git ignora; veja .gitignore)
capturas        capturas de tela geradas para revisão visual
```

Documentos relacionados: `DEPLOY.md` (hospedagem gratuita, passo a passo, com as opções comparadas), `README.md` (arquitetura, modelo de dados e rotas) e `DESIGN.md` (sistema visual e acessibilidade).
