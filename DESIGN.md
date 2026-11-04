# Sistema visual

Direção: "painel de campo". A ideia vem das referências que a estagiária escolheu: barra lateral azul-marinho sólida com ícones em círculo, cartões brancos sobre fundo claro com sombra suave, laranja vivo reservado para ação e destaque de dado, e títulos grandes em serifa. O resultado deve lembrar um caderno de campo bem organizado, não um painel genérico de administração.

O arquivo de tokens é `apps/web/src/estilo/tokens.css`; todas as telas leem dele. Mudar a paleta ou o tamanho base do texto é mexer só nesse arquivo.

## Cores

| Papel | Token | Valor | Uso |
| --- | --- | --- | --- |
| Fundo | `--ground` | `#f6f4ef` | areia clara, atrás dos cartões |
| Cartão | `--surface` | `#ffffff` | todas as superfícies de conteúdo |
| Texto | `--text` | `#152a4b` | texto principal |
| Secundário | `--muted` | `#4c5766` | subtítulos e apoio (7,3:1 sobre branco) |
| Metadados | `--faint` | `#5f6877` | datas e rótulos pequenos (5,8:1) |
| Barra lateral | `--navy` | `#172b4d` | navegação e barra do topo no telefone |
| Ação | `--accent` | `#b34d17` | botões primários, item ativo, barra do dado (5,3:1) |
| Ação escura | `--accent-strong` | `#8a3d0c` | links e hover |
| Foco | `--focus` | `#1d4ed8` | contorno de foco, azul para não se confundir com o laranja de ação |
| Borda de campo | `--control` | `#928b7c` | contorno de campos, 3,4:1 (WCAG 1.4.11) |

Estados usam cor mais um segundo sinal: "aberta" verde com ponto, "pendente" amarelo com borda tracejada, "encerrada" cinza. A aba ativa e o item ativo da navegação inferior ganham uma barra sólida, para quem não distingue as cores.

## Tipografia

- **Texto e interface:** Source Sans 3 (arquivos locais em `apps/web/public/fontes`, sem chamada a serviços externos).
- **Títulos:** serifa do sistema (Iowan Old Style, Palatino, Georgia), com `letter-spacing` levemente apertado.

Tamanhos base: corpo 16px, apoio 15px, metadados 13px, título de seção 19px, título de tela `clamp(30px, 3.4vw, 40px)`.

O controle "Tamanho do texto", no rodapé da barra lateral, tem três medidas: Padrão, Grande (corpo 18px) e Muito grande (corpo 20px). A escolha vai para `<html data-texto>` (`normal`, `grande` ou `maior`) e fica guardada em `localStorage` na chave `nupe-texto`, então vale em todas as telas e sobrevive a recarregar.

## Layout

- **Computador (a partir de 861px):** barra lateral fixa de 252px com marca, navegação em dois grupos (Painel, Coletas, Resultados / Fichas de campo, Matrizes, Relatório), controle de texto e conta. O conteúdo ocupa a área restante com cartões.
- **Telefone (até 860px):** a barra lateral vira menu lateral completo, aberto pelo botão "Menu" numa barra do topo azul-marinho; a navegação principal desce para uma barra inferior fixa com cinco destinos e âncora segura para o recorte do iPhone (`env(safe-area-inset-bottom)`). O conteúdo reserva espaço para a barra inferior para não ficar coberto no fim da página.
- Grades de duas ou três colunas no computador viram uma coluna no telefone.

## Componentes

- **Cartão (`.painel`):** branco, raio de 14px, borda de 1px e sombra de duas camadas.
- **Título de seção (`.titulo-secao`):** barra laranja à esquerda e texto grande em negrito, usado fora dos cartões.
- **KPI (`.kpi`):** ícone em círculo azul-marinho, número grande tabular e rótulo abaixo.
- **Abas de público (`.segmentado`):** grupo com fundo areia; a aba ativa em branco, negrito e com barra inferior azul-marinho. Quebram em quantas linhas forem necessárias no telefone, em vez de rolar na horizontal.
- **Botões (`.btn`):** altura de 42px no computador e 44px no telefone; primário laranja, secundário branco com borda.
- **Campos:** rótulo acima do campo, borda de 1px e foco azul de 3px. Célula vazia de ficha mostra `[preencher]` em itálico.
- **Aviso (`.aviso`):** fundo laranja diluído, ícone, texto e uma ação opcional; no telefone a ação desce para a linha de baixo.

## Acessibilidade

- Contraste mínimo de 4,5:1 em texto e 3:1 em bordas e ícones com significado.
- Corpo de 16px por padrão, com controle de aumento guardado no navegador.
- Link "Ir para o conteúdo" como primeiro elemento focável, com foco preso à região principal.
- Foco visível azul em todos os controles, com deslocamento para não sumir contra o elemento.
- Todos os campos têm rótulo associado; abas seguem o padrão de `tablist` com setas, Home e End.
- Alvos de toque com 44px no telefone.
- Movimento reduzido respeitado (`prefers-reduced-motion`).
- Avisos usam `role="alert"`, `role="status"` ou `role="note"` conforme a urgência.
- Zoom do navegador e reflow: em 390px de largura não há rolagem horizontal.

## Impressão

O relatório tem uma folha de estilo própria para A4 (`apps/web/src/estilo/relatorio.css`), com margens e quebras evitadas dentro de tabelas e seções. O botão "Gerar PDF" abre a versão de impressão em `/api/report/document`, que já sai sem a navegação do sistema e termina com uma linha de encerramento com a data de geração.

## Capturas

`npm run capturar` gera `capturas/{tela}-{largura}.png` em 1440, 768 e 390px, com a página recarregada em cada largura para que a barra superior e a inferior apareçam no lugar certo.
