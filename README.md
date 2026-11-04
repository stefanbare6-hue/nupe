# NUPE: instruções técnicas

Este documento explica como o sistema é feito, para quem for mantê-lo. Para o uso no dia a dia veja `PRODUCT.md`; para as decisões visuais, `DESIGN.md`.

## Visão geral

Um único processo Node serve a API e a interface compilada. Não há banco de dados externo: o estado inteiro vive em um arquivo JSON gravado de forma atômica.

```
navegador ──HTTPS──> proxy (Caddy/nginx) ──HTTP──> apps/api (Fastify 5)
                                                     ├── /api/*        rotas
                                                     ├── /assets/*     interface compilada (Vite)
                                                     └── data/nupe.json
```

O código de regras fica em `packages/core` e é usado tanto pela API quanto pela interface, então o questionário, as contas estatísticas e o relatório têm uma definição só.

## Pacotes

| Caminho | Pacote | Papel |
| --- | --- | --- |
| `packages/core` | `@nupe/core` | questionários (`surveys.ts`), estatística (`stats.ts`), temas (`themes.ts`), fichas e modelos (`forms.ts`, `flows.ts`), relatório (`report-model.ts`, `report-export.ts`), tipos compartilhados |
| `apps/api` | `@nupe/api` | Fastify: `server.ts` (inicialização), `app.ts` (montagem, estáticos, cabeçalhos), `routes-public.ts`, `routes-admin.ts`, `db.ts` (armazenamento), `auth.ts`, `seed.ts` (demonstração) |
| `apps/web` | `@nupe/web` | React 19 com Vite: `telas/`, `componentes/`, `lib/` (HTTP, roteador, formatação, gravação) e `estilo/` (tokens e folhas por área) |

`app.ts` é separado de `server.ts` para que os testes subam a mesma aplicação real numa porta efêmera, com um arquivo de dados temporário.

## Modelo de dados

O arquivo (`data/nupe.json`, ou o caminho em `NUPE_DATA`) segue este formato. Toda gravação escreve um arquivo temporário e o renomeia por cima do original, então uma queda no meio da gravação não corrompe os dados.

| Campo | Conteúdo |
| --- | --- |
| `schemaVersion` | versão do formato; `migrate()` completa campos ausentes ao abrir |
| `admin` | `{ id, email, name, passwordHash, createdAt }` ou `null` antes da configuração |
| `sessions` | sessões ativas: `{ tokenHash, createdAt, expiresAt }` (o token em claro fica no cookie) |
| `collections` | uma coleta por pública por versão: `{ id, publicId, audience, label, status, opensAt, closesAt, demo, createdAt }` |
| `entries` | respostas: `{ id, collectionId, submittedAt, answers: [{ questionId, value }] }` |
| `openResponses` | respostas abertas por tema: `{ id, entryId, collectionId, audience, questionId, text, themeIds, manualThemeId, createdAt }` |
| `themes` | temas disponíveis: `{ id, label, keywords[] }` |
| `contest` | por coleta, HMAC das sessões anônimas que já responderam (impede envio repetido) |
| `institution` | ficha 1 e 2: `{ fields, numbers[], updatedAt }` |
| `flows` | ficha 3: fluxos `{ id, name, process, steps[], bottlenecks[], systems[] }` |
| `systems` | ficha 4: sistemas e seus campos |
| `procedures` | ficha 5: `{ id, procedure, base, responsible, deadline }[]` |
| `improvement` | ficha 6: plano 5W2H e cartões PDCA |
| `diary` | ficha 7: diário de campo |
| `glossary` | ficha 8: glossário |
| `matrices` | `{ porter, swot, gut, notes }` |
| `settings` | nome exibido, período do estágio, supervisão, curso, limite de envio |
| `visits` | contagem de visitas por dia, só número |
| `demo` | rótulo do conjunto fictício ativo, ou `null` |
| `recordVersions` | última versão aceita de cada ficha gravada em bloco |
| `log` | registro de atividade curto (ação e data, sem dados pessoais) |

Não existe campo de IP em lugar nenhum do arquivo.

### Gravação das fichas em bloco

Fichas são gravadas inteiras (tudo ou nada). Duas requisições podem sair fora de ordem: uma mais velha chegaria depois e desfaria a mais nova. Para evitar isso:

1. o cliente numera cada lote (`apps/web/src/lib/versao.ts`);
2. o servidor guarda a última versão aceita por ficha em `recordVersions`;
3. versão menor ou igual à última responde `200 { ok, ignorado: true, versao }`;
4. versão 1 quando o servidor já recebeu alguma (navegador novo, outra aba) responde `409 { error, versao }`, e o cliente renumera e reenvia uma vez;
5. `GET /api/records` devolve `recordVersions` para o contador do navegador continuar de onde o servidor parou.

## Rotas

### Públicas (sem sessão)

| Método e caminho | Para quê |
| --- | --- |
| `GET /api/public/health` | verificação de saúde |
| `GET /api/public/surveys/:id` | questionário do link (`:id` é o `publicId`), com status da coleta |
| `GET /api/public/stats/:audience/responses` | contagem pública exibida ao responder |
| `POST /api/public/session` | cria a sessão anônima usada contra envio repetido |
| `POST /api/public/surveys/contest` | emite o voucher assinado que acompanha o envio |
| `POST /api/public/surveys/:id/responses` | recebe as respostas |

### Internas (exigem sessão)

| Método e caminho | Para quê |
| --- | --- |
| `GET /api/setup/status`, `POST /api/setup` | configuração inicial da conta |
| `POST /api/login`, `POST /api/logout`, `GET /api/me` | sessão |
| `GET /api/dashboard` | painel: contagens, coletas, atividade, pendências |
| `PATCH /api/collections/:id` | abrir, encerrar, renomear, definir prazo |
| `POST /api/collections/:id/rotate-link` | gerar link novo (o antigo deixa de valer) |
| `GET /api/collections/links` | links das coletas abertas |
| `GET /api/results/:audience` | resumo do público, temas e respostas abertas |
| `PUT /api/open-responses/:id/theme` | corrigir o tema de uma resposta aberta |
| `GET /api/themes`, `POST /api/themes` | temas |
| `GET /api/records` | todas as fichas e matrizes, com `recordVersions` |
| `PUT /api/records/:kind` | grava uma ficha em bloco |
| `POST /api/records/flows` | cria fluxo a partir de modelo |
| `GET /api/report` | modelo do relatório (JSON) |
| `GET /api/report/document` | relatório em HTML pronto para impressão (PDF) |
| `POST /api/demo/seed`, `POST /api/demo/clear` | carregar e remover a demonstração fictícia |

A exportação em Word é montada na interface a partir de `renderWordDocument()` de `@nupe/core` e baixada como `.doc` (HTML que o Word abre nativamente).

## Segurança e privacidade

- **Senha:** `scrypt` com sal aleatório por usuário, comparada em tempo constante.
- **Sessão:** token aleatório no cookie `nupe_sid`, `HttpOnly`, `SameSite=Strict`, `Secure` quando a requisição chega por HTTPS, em proxy (`X-Forwarded-Proto`). No servidor só o SHA-256 do token é guardado.
- **CSRF:** toda escrita exige o cabeçalho `x-nupe-client: web` e, quando o navegador envia `Origin`, a mesma origem.
- **Cabeçalhos:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, Content-Security-Policy sem `unsafe-inline` para script.
- **Arquivos estáticos:** interface em `apps/web/dist`; pedido de arquivo inexistente responde 404, nunca o `index.html` (que faria o navegador recusar uma folha de estilo entregue como HTML).
- **Anti-repetição:** a sessão anônima nasce no navegador (`localStorage`) e é enviada junto com um voucher assinado com `NUPE_SECRET`, válido entre 5 e 10 minutos. O servidor guarda apenas `HMAC(sessionId)` por coleta, então não é possível voltar ao identificador nem cruzar respostas.
- **Limites:** 8 envios por aparelho e 200 por endereço a cada 10 minutos; 300 sessões por endereço a cada 10 minutos; 8 tentativas de login por endereço a cada 10 minutos.
- **Respostas abertas:** removem caracteres de controle e têm tamanho máximo antes de gravar.

## Testes

| Arquivo | Cobre |
| --- | --- |
| `packages/core/src/stats.test.ts` | contagem, percentuais só com 5 ou mais, médias |
| `packages/core/src/flows.test.ts` | modelos de fluxo e validação |
| `packages/core/src/report-model.test.ts` | nove seções, evidências, campos faltantes |
| `packages/core/src/report-export.test.ts` | Word, HTML de impressão, A4 e fecho do documento |
| `apps/api/src/db.test.ts` | migração, gravação atômica |
| `apps/api/src/api.test.ts` | rotas públicas e internas na aplicação real, versões de gravação, demonstração |

O teste de ponta a ponta (`scripts/e2e.mjs`, via `npm run e2e`) sobe um servidor próprio com dados descartáveis e abre um Chromium real percorrendo login, abertura de coleta, envio público, recusa de segundo envio do mesmo aparelho, resultados, fichas, matrizes, relatório, ajustes, saída, atalho de conteúdo, tamanho do texto, menu do telefone e ausência de rolagem horizontal em 390px.

Para revisar o visual, `npm run capturar` gera as telas em `capturas/` nas larguras 1440, 768 e 390px.

## Publicar

O passo a passo de hospedagem (Render, Railway, Fly.io, Docker) e a comparação de planos gratuitos e de VPS estão em `DEPLOY.md`. **O caminho escolhido para o estágio é o Railway, no Caminho 2, com volume em `/dados`.** O projeto já inclui `Dockerfile`, `docker-compose.yml`, `render.yaml`, `railway.json` e, para demonstração, a função `api/index.ts` da Vercel.

Pontos de código que existem por causa da hospedagem:

- o servidor procura a interface compilada também a partir da pasta em que foi iniciado, e avisa se não achar;
- o cookie de sessão usa `X-Forwarded-Proto`, para continuar seguro atrás de proxy;
- se o sistema de arquivos não for gravável, o servidor sobe em memória e avisa no log, em vez de falhar no start;
- uma gravação que falha não trava as próximas nem derruba o processo.

## Limitações conhecidas

- Um único usuário (a estagiária); não há papéis nem várias contas.
- O armazenamento em arquivo JSON atende uma pessoa editando e um público respondendo. Para uso simultâneo em escala maior, o `Store` precisaria de um banco de dados.
- A sugestão de tema é por palavras-chave, não por modelo de linguagem; a correção é sempre manual.
- O PDF é gerado pelo diálogo de impressão do navegador (destino "Salvar como PDF"), o que mantém o sistema sem dependências nativas.
