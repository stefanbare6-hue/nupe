# Publicar o sistema do NUPE

O sistema é um único processo Node: a API e a interface saem juntas do mesmo endereço. Publicar significa rodar esse processo em algum lugar com HTTPS na frente, porque o cookie de sessão só sai seguro em `https`.

Existe um problema de fundo que decide o plano: **todo o sistema grava um arquivo JSON a cada resposta ou edição**. Quem hospeda sem disco gravável perde os dados quando o serviço reinicia. Por isso a escolha da hospedagem não é só de preço.

## Respostas anônimas e dados reais

O questionário público é anônimo e o sistema é feito para receber respostas e ficar no ar durante o período do estágio. Ele guarda o cadastro da estagiária e todas as respostas em um único arquivo. Se esse arquivo some, o trabalho some junto.

| Precisa | Por quê |
| --- | --- |
| Disco que sobrevive a reinício | O arquivo JSON é a única cópia dos dados. |
| Processo sempre ligado | O link público precisa abrir na hora em que a pessoa responde. |
| HTTPS | Sem ele a sessão da estagiária não funciona de forma segura. |

## Opções gratuitas, comparadas

Consultei a documentação de cada uma. Preço e limites mudam, então confira antes de decidir.

| Serviço | Grátis? | Dados sobrevivem? | Serve para o período do estágio? |
| --- | --- | --- | --- |
| **Render** (serviço web) | Sim, plano Free | Não. O disco é apagado a cada publicação, reinício e quando o serviço dorme por 15 minutos sem acesso | Para testar e mostrar, sim. Para receber respostas de verdade, não. |
| **Railway** | Crédito de US$ 5 na avaliação gratuita (30 dias). Depois US$ 1 por mês no plano Free, com volume de até 500 MB | Sim, se anexar um volume | Sim, com o volume. Cabe nos US$ 5 do começo; depois o plano Free é apertado. |
| **Fly.io** | Não tem nível gratuito; avaliação de 7 dias ou 2 horas de máquina | Sim, com volume | Sim, se pagar. A menor máquina custa cerca de US$ 2,19 por mês mais o volume. |
| **Vercel** (função serverless) | Sim | Não. Só a pasta temporária é gravável e ela é descartada | Só para demonstração. O arquivo `api/index.ts` está pronto para isso. |
| **Computador da escola ou de casa + túnel** | Sim | Sim | Para testar. Não é confiável como link público do estágio. |

O **Hostinger** não tem plano gratuito para este sistema. O que ele oferece é VPS com Docker, a partir de US$ 6,49 por mês no KVM 1, e não dá para rodar o `Dockerfile` na hospedagem compartilhada dele. A seção "Caminho 4" explica essa opção.

**Recomendação para o estágio:** Railway com volume no começo e, se o crédito acabar antes do fim, o menor plano em Fly.io (ou Railway Hobby, US$ 5 por mês). Nesse perfil de uso, umas poucas respostas por dia, o custo fica em torno de US$ 3 a 4 por mês. Se for só apresentar para a coordenação, o Render Free resolve, desde que você entenda que as respostas do dia somem quando o serviço dormir.

## Opções mais baratas que a Hostinger

Procurei fora do Hostinger. Os preços abaixo são os que os sites mostram hoje, em dólar ou euro e sem domínio, e mudam com promoção e com o tempo de contrato. Todos pedem cartão.

| Serviço | Menor plano | Preço | O que vem | Como usar |
| --- | --- | --- | --- | --- |
| **Kamatera** | Cloud Server Basic | US$ 4 por mês | 1 vCPU, 1 GB de RAM, 20 GB NVMe, 5 TB de tráfego | VPS comum: instale Docker e siga o Caminho 4 trocando o IP. Tem 30 dias de teste até US$ 100. |
| **OVHcloud** | VPS-1 | a partir de US$ 4,54 por mês | 2 vCPU, 4 GB de RAM, 40 GB NVMe, tráfego ilimitado, backup diário incluído | O mesmo caminho do Hostinger. O backup diário é vantagem rara nessa faixa. |
| **Contabo** | Cloud VPS 4 | € 5,50 por mês no contrato de 24 meses (€ 4,40 se pagar todo o período à frente) | 4 vCPU, 8 GB de RAM, 100 GB SSD | Tamanho maior do que o necessário. No plano mensal há taxa de instalação, então só vale se o contrato for longo. |
| **Google Cloud** | e2-micro no nível gratuito | R$ 0, com cartão cadastrado | 1 máquina pequena em regiões dos EUA, 30 GB de disco, 1 GB de saída por mês | A VM gratuita é sempre ligada e tem disco. No começo também há US$ 300 de crédito por 90 dias. Exige mexer no console da Google, é o caminho mais técnico da lista. |

O **Google Cloud** é a única opção que sai de graça depois do período de teste. A máquina e2-micro aguenta esse sistema com folga, porque o uso é de poucas respostas por dia. O trabalho maior é criar a VM, abrir a porta e configurar o Docker e o HTTPS, tudo pela linha de comando ou pelo console.

Comparando com a Hostinger KVM 1, de US$ 6,49 por mês: o OVHcloud custa cerca de US$ 2 a menos, tem o dobro de processadores e backup diário. O Kamatera custa US$ 2,49 a menos, mas tem menos memória e mais passos de configuração.

Abaixo estão os três caminhos que testei na estrutura do projeto. Os arquivos `Dockerfile`, `render.yaml` e `railway.json` já estão aqui, então a maior parte do trabalho é apertar botões.

## Antes de qualquer hospedagem: levar o código para o GitHub

Os serviços publicam a partir de um repositório. O `git` já foi preparado dentro de `E:\nupe` e o primeiro envio está pronto; falta criar o repositório vazio no GitHub e apontar para ele.

1. Em github.com, clique em **New repository**, dê o nome `nupe`, marque **Private** e **não** marque "Add a README".
2. No PowerShell, dentro de `E:\nupe`:

```powershell
git commit -m "sistema do estagio no NUPE"
git remote add origin https://github.com/SEU-USUARIO/nupe.git
git branch -M main
git push -u origin main
```

O `.gitignore` já deixa de fora `node_modules`, os arquivos compilados, a pasta `data` e as capturas. **A pasta `data` fica de fora de propósito**: `data/dev.json` tem a senha de teste e o arquivo real tem o hash da sua senha. Nenhum dos dois pode ir para o GitHub.

Na hora de enviar, o GitHub pede usuário e senha. **A senha ali é um token, não a senha da conta.** Gere em GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic), com a permissão `repo`, e cole o token.

Privado é o certo aqui: o repositório tem o código de um sistema interno, mesmo sem os dados.

## Antes de qualquer hospedagem: levar o código para o GitHub

Os serviços publicam a partir de um repositório. A pasta do projeto ainda não é um repositório git, e você precisa de uma conta no GitHub (ou GitLab).

No PowerShell, dentro de `E:\nupe`:

```powershell
git init
git add .
git commit -m "sistema do estagio no NUPE"
```

O `.gitignore` já deixa de fora `node_modules`, os arquivos compilados, a pasta `data` e as capturas. **A pasta `data` fica de fora de propósito**: `data/dev.json` tem a senha de teste e o arquivo real tem o hash da sua senha. Nenhum dos dois pode ir para o GitHub.

Depois, crie um repositório **privado** no GitHub pelo site e envie:

```powershell
git remote add origin https://github.com/SEU-USUARIO/nupe.git
git branch -M main
git push -u origin main
```

Privado é o certo aqui: o repositório tem o código de um sistema interno, mesmo sem os dados.

Em qualquer serviço, o primeiro acesso ao endereço publicado abre `/configurar`, onde você cria a conta de verdade. Não use a conta de teste `maria@exemplo.br`.

## Caminho 1: Render (gratuito, para demonstração)

1. Crie a conta em render.com e conecte o GitHub.
2. **New > Blueprint** e escolha o repositório. O Render lê o `render.yaml` sozinho e cria o serviço "nupe" no plano Free, já com o comando de build, o comando de início, a verificação de saúde e uma chave secreta gerada por ele.
3. Espere o build (alguns minutos). O endereço fica como `https://nupe-xxxx.onrender.com`.
4. Abra o endereço, conclua `/configurar` e pronto.

O que você precisa saber deste plano, pela documentação do Render:

- o serviço **dorme após 15 minutos sem acesso** e demora cerca de um minuto para acordar no primeiro acesso seguinte;
- **qualquer alteração no disco é perdida** quando ele dorme, é reiniciado ou recebe uma nova publicação. Como o sistema grava em arquivo, as respostas e as fichas voltam ao estado do último deploy;
- o plano Free dá 750 horas de máquina por mês, o que basta para um serviço.

Uma alternativa honesta para o Render Free: use-o só para mostrar o sistema com a demonstração fictícia carregada (botão "Demonstração" no painel), sem depender de guardar o que foi digitado.

## Caminho 2: Railway (o escolhido)

O Railway não usa o `railway.json` sozinho para a imagem; ele detecta o `Dockerfile`.

### Primeiro: mandar o código para o GitHub

Siga a seção "Antes de qualquer hospedagem" e volte aqui quando o `git push` terminar.

### Publicar no Railway

1. Crie a conta em railway.com, conecte o GitHub e escolha **New Project > Deploy from GitHub repo**.
2. Autorize o Railway a ver o repositório `nupe` (se ele não aparecer, clique em **Configure GitHub App** e dê acesso).
3. Selecione o repositório. O Railway encontra o `Dockerfile` e constrói a imagem (a interface já sai compilada dentro dela).
4. O build demora de 3 a 6 minutos na primeira vez. Acompanhe em **Deployments**; quando ficar verde, o serviço está no ar.
5. Abra o serviço, vá em **Settings > Volume** (na versão nova, **+ New > Volume** dentro do projeto), e adicione um volume montado em **`/dados`**. É ali que o Dockerfile manda gravar o arquivo (`NUPE_DATA=/dados/nupe.json`).

   Se o volume for criado antes do serviço existir, o Railway pode gravar nele uma pasta de sistema (`lost+found`). O sistema só usa o `nupe.json` e ignora o resto.
6. Em **Variables**, defina `NUPE_SECRET` com uma chave longa. Gere uma no seu computador:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

7. Em **Settings > Networking**, clique em **Generate Domain**. O HTTPS vem junto. O endereço fica como `https://nupe-production-xxxx.up.railway.app`.
8. Abra o endereço, conclua `/configurar` com o seu e-mail e uma senha de verdade, e use.

### Conferir que o disco está certo

Faça isto antes de divulgar os links públicos:

1. Crie a conta em `/configurar`, feche o navegador e entre de novo. Se pedir para configurar outra vez, o volume não foi montado onde o sistema grava.
2. No painel do Railway, em **Deployments**, clique em **Redeploy**. É como reiniciar o servidor. Depois de voltar, entre de novo: a conta e as respostas precisam continuar lá.

### O que o Railway cobra

- na avaliação gratuita, US$ 5 de crédito por 30 dias, uma vez só;
- depois, plano **Hobby** de US$ 5 por mês, ou o **Free** de US$ 1 mensal com volume de até 500 MB (o arquivo do estagiário tem poucos megabytes);
- volume de 1 GB custa cerca de US$ 0,25 por mês, e a máquina pequena, pouco mais de US$ 1 por mês. No uso do estágio, o consumo fica bem abaixo do que o plano inclui.

O arquivo de dados é pequeno, então o custo real é o do plano, não o do volume. Com o crédito inicial, o primeiro mês sai de graça.

### Cópia de segurança no Railway

O volume está no servidor deles, não no seu computador. Uma vez por dia de campo, baixe o arquivo pelo painel: no volume, selecione `nupe.json` e baixe. Guarde em uma pasta com a data no nome.

Se o projeto continuar ligado depois do estágio, exporte também o relatório final em Word e PDF: esses dois arquivos ficam fora do sistema e servem de registro mesmo que o serviço seja desligado.


## Caminho 3: Dockerfile em qualquer lugar

O `Dockerfile` é independente de serviço e serve para Fly.io, VPS, escola ou o próprio computador:

```powershell
docker build -t nupe .
docker run -p 3333:3333 -e NUPE_SECRET=sua-chave -v nupe-dados:/dados nupe
```

Ou, sem digitar tudo:

```powershell
docker compose up --build
```

Abre em `http://localhost:3333` e guarda os dados no volume `nupe-dados` / `dados`.

No Fly.io, o caminho é `fly launch` (ele encontra o `Dockerfile`), criar um volume com `fly volumes create dados --size 1` e montar em `/dados` no `fly.toml`:

```toml
[[mounts]]
  source = "dados"
  destination = "/dados"
```

Atenção ao Fly: **não há nível gratuito**. A avaliação dura 7 dias ou 2 horas de máquina, e depois é preciso cartão. A máquina menor custa cerca de US$ 2,19 por mês e o volume de 1 GB, US$ 0,15.

## Caminho 4: Hostinger VPS com Docker

O Hostinger tem uma linha de VPS com Docker e não tem plano gratuito. O `Dockerfile` do projeto roda lá sem mudança, porque a imagem já traz a API e a interface compilada.

O que a documentação do Hostinger informa:

- o **Docker VPS** usa os mesmos planos KVM do VPS comum. O menor, KVM 1, tem 1 vCPU, 4 GB de RAM e 50 GB de NVMe e aparece por US$ 6,49 por mês, cobrado à frente pelo período do plano;
- a escolha do Docker é feita no template do sistema, **Ubuntu 24.04 com Docker**, e leva cerca de 10 minutos para instalar;
- o painel tem um **Docker Manager**, que sobe um projeto a partir de um arquivo Compose e pode puxar o repositório do GitHub;
- há um template de **Traefik**, que dá domínio e HTTPS automático para os containers;
- os backups semanais são automáticos.

**O que não funciona:** os planos de hospedagem compartilhada. Eles servem para WordPress e para aplicações Node.js gerenciadas pelo painel, sem acesso ao Docker, e não executariam este `Dockerfile`.

### Passo a passo

1. Contrate um VPS KVM 1 em hostinger.com. Na criação, escolha o template Ubuntu 24.04 com Docker.
2. No hPanel, em **VPS > Manage**, abra o **Docker Manager**. Se preferir pelo terminal, conecte por SSH (`ssh root@SEU-IP`).
3. Leve o código para a VPS. A forma mais simples é clonar o repositório privado do GitHub. Depois, dentro da pasta:
4. Defina a chave secreta e suba o container com os dados em um volume que fica fora do container:

```bash
export NUPE_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
docker build -t nupe .
docker run -d --name nupe --restart unless-stopped \
  -p 3333:3333 \
  -e NUPE_SECRET="$NUPE_SECRET" \
  -v nupe-dados:/dados \
  nupe
```

O volume `nupe-dados` guarda o `nupe.json`. Ele sobrevive a `docker rm`, a `docker stop` e a uma nova imagem no `docker build`.

5. Para o HTTPS, coloque um proxy na frente. Duas opções que a Hostinger documenta:

   - **Traefik**: adicione as etiquetas no `docker-compose.yml` e o Traefik cuida do domínio e do certificado de cada app.
   - **Caddy**, que é mais simples para um único site. Crie um `Caddyfile` com o seu domínio e o Caddy emite o certificado sozinho:

     ```
     nupe.seudominio.com {
       reverse_proxy localhost:3333
     }
     ```

   Com proxy na frente, defina também `NUPE_BEHIND_PROXY=1` na variável do container. Sem isso, os limites por endereço enxergam o IP do proxy e não o do visitante.

6. Abra o domínio, conclua `/configurar` e pronto.

### Guarde o arquivo de dados

O volume fica na VPS. Se o servidor for reinstalado, os dados vão junto. Copie o arquivo para o seu computador ao fim de cada dia de campo:

```bash
docker exec nupe cat /dados/nupe.json > nupe-backup.json
```

Também vale procurar no Docker Manager uma opção de baixar arquivos do volume pela interface.

### Hostinger ou Railway

O Railway cobra pelo uso, com crédito de US$ 5 na avaliação e US$ 1 por mês no plano Free, e o volume de 500 MB cabe os dados. Ele dá menos trabalho e sai mais barato no primeiro mês. O Hostinger só compensa se você já tiver conta lá, se quiser um domínio próprio com o e-mail incluído, ou se o tempo de estágio for longo e você preferir um preço fixo por mês.

## Variáveis de ambiente

| Variável | O que faz |
| --- | --- |
| `NUPE_SECRET` | Chave que assina a sessão e o teste anti-repetição. **Sempre defina**; sem ela o servidor usa uma chave de desenvolvimento e avisa no log. Trocar a chave desconecta a estagiária e derruba vouchers em andamento, mas não apaga respostas nem permite que um aparelho responda duas vezes. |
| `NUPE_DATA` | Caminho do arquivo JSON. Deve ficar em um disco que sobrevive a reinícios. |
| `NUPE_WEB_DIST` | Pasta da interface compilada. Normalmente não precisa: o servidor a encontra sozinho. |
| `NUPE_SECURE_COOKIE` | `1` força o cookie de sessão só em HTTPS. Não é necessário em Render e Railway, que chegam como HTTPS. |
| `NUPE_BEHIND_PROXY` | `1` quando há proxy na frente (Docker atrás de nginx, por exemplo), para os limites por endereço lerem o IP real. |
| `PORT` | Porta HTTP. Render e Railway definem sozinhos. |
| `LOG_LEVEL` | `info` para ver os registros do servidor no painel do serviço. |

Em VPS (Hostinger, OVHcloud, Kamatera, Contabo, Google Cloud), as variáveis vão no comando `docker run` com `-e`. No Hostinger e no OVHcloud, use o mesmo `Dockerfile` e o mesmo volume de `/dados`; o que muda é o IP e o painel onde os backups aparecem.

## Depois de publicado

1. **Cópia de segurança.** Como tudo vive em um arquivo, faça cópia diária. No Railway, baixe o volume ou use um script no seu computador com a URL e o login. A forma mais simples é a mesma do uso local: copie `nupe.json` para o seu computador ao fim de cada dia de campo.
2. **Links públicos.** Em `/coletas`, copie os links de cada público. Eles apontam para o endereço publicado automaticamente.
3. **Demonstração.** Se carregar os dados fictícios no servidor publicado, remova antes do relatório final, pelo botão no painel.
4. **Prazo das coletas.** Feche a coleta quando parar de divulgar.

## Privacidade no servidor publicado

Nada de IP ou nome de respondente é gravado. O que o servidor guarda para impedir que o mesmo aparelho responda duas vezes é um código de embaralhamento (HMAC) do identificador anônimo do navegador, com a chave `NUPE_SECRET`. Esse código é apagado depois de 24 horas, e trocar a chave gera códigos novos.

A página do sistema está marcada com `noindex`: buscadores não devem listá-la. Mesmo assim, trate os links públicos como material de divulgação, não como algo secreto; qualquer pessoa com o link pode responder enquanto a coleta estiver aberta.

## Para conferir antes de enviar

Estes comandos rodam no projeto e não publicam nada:

```powershell
npm run build            # compila as três partes
npm test                 # 87 testes de regra, API e armazenamento
npm run e2e              # 23 verificações num navegador real
npm run typecheck:strict # checagem estrita, incluindo a função da Vercel
npm run vercel:checa     # simula a função serverless da Vercel
npm run disco:checa      # hospedagem sem disco gravável (modo memória)
node scripts/checa-docker.mjs  # reproduz o build limpo da imagem
```

O `checa-docker` não precisa de Docker instalado: ele copia só os arquivos que o `Dockerfile` usa, roda a instalação e o build do zero e sobe o servidor com apenas as pastas compiladas.
