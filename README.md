# Prospecta — CRM de prospecção da equipe

Sistema web para a equipe registrar as empresas prospectadas, com painel de quem mais prospectou.

**Stack:** HTML, CSS e JavaScript puro no front · Node.js + Express no back · PostgreSQL no banco.

## O que tem

- **Login** — só entra quem tem usuário criado pelo administrador.
- **Equipe (só ADM)** — criar, editar, trocar senha, desativar e excluir funcionários.
  Quem já tem prospecções não pode ser excluído (para não perder o histórico): desative o acesso.
- **Prospecções** — empresa, nicho, resultado (aceitou / pensando / recusou), número,
  localidade, Instagram, site, outras redes e anotações. Quem prospectou é preenchido sozinho.
  - Nicho: escolha um que já existe ou digite um novo — ele fica salvo para todo mundo.
  - Busca e filtros por status, nicho e pessoa.
  - Clicando na empresa: todos os detalhes, botão de WhatsApp, link do mapa, e troca rápida do resultado.
  - Todos veem todas as prospecções (evita duas pessoas ligarem para a mesma empresa),
    mas cada funcionário só edita/exclui as próprias. O ADM edita tudo.
- **Painel** — totais, taxa de aceite, ranking de quem mais prospectou (com foto) e resultado por nicho,
  filtrando por 7, 30, 90 dias ou tudo.
- **Financeiro (só ADM)** — contratos fechados com o valor de cada projeto, seu lucro, comissão de cada
  funcionário (paga / a pagar) e gráficos por mês e por funcionário.
  - Comissão automática = valor fixo + porcentagem do projeto (padrão: R$ 40 + 20% → site de R$ 450 dá
    R$ 130; de R$ 900 dá R$ 220). Sem limite máximo. Editável na própria tela.
  - Em cada contrato dá para trocar para "Eu defino o valor".
  - Mudar a regra vale para os próximos contratos; os já registrados mantêm a comissão.
  - Contratos fechados pelo próprio ADM não têm comissão.
- **Filtro de período** (Painel, Observações e Financeiro) — escolha o ano, um mês ou "Ano todo", "Todos os
  anos", ou datas personalizadas (de / até). A escolha fica lembrada em cada tela.
- **Relatório mês a mês** (Painel) — quem mais prospectou em cada mês, de todos os anos. Clique num mês para filtrar.
- **Observações** — anotações de todas as empresas e os **problemas em comum** (campo "Problemas da empresa" no
  cadastro, com várias etiquetas). Mostra quantas empresas têm cada problema e em quais nichos aparece mais.
- **Gráficos com detalhes** — passe o mouse (ou toque) nas colunas e barras para ver os valores exatos.
- **Criar gráfico** (Financeiro) — colunas, barras, linhas ou pizza, mostrando faturamento, comissão ou nº de
  contratos, com as pessoas que você escolher.
- **Meus ganhos** (Perfil do funcionário) — a comissão de cada contrato dele, a receber e já recebida. Só aparece
  depois que o ADM registra um contrato. O funcionário não vê o valor do projeto, só a comissão.
- **Detalhes do funcionário** — no Painel, clique numa pessoa: aceitou / pensando / recusou, taxa de aceite
  e últimas prospecções. O ADM vê também quanto ela vai receber.
- **Retornos** — no cadastro, "Ligar de novo em" (atalhos: amanhã, 3 dias, 1 semana). No topo de Prospecções aparecem
  os atrasados, os de hoje e os dos próximos 7 dias, com botão de WhatsApp, "✓ Feito" e "Adiar". O número vermelho no
  menu mostra quantos são para hoje. A gestão pode ver os da equipe toda. Quando a empresa aceita ou recusa, o lembrete sai sozinho.
- **Histórico (gestão)** — registra quem cadastrou, editou ou excluiu prospecções, contratos, comissões pagas, regra de
  comissão, logins e cargos, com data e hora. Dá para filtrar por período, tipo e pessoa.
- **Exportar para Excel** — botão "Excel" em Prospecções, Meus ganhos, Equipe, Financeiro e Histórico. Gera um arquivo
  .xlsx de verdade (com R$, datas, totais e filtro no cabeçalho), feito no próprio navegador pelo `public/planilha.js`,
  sem biblioteca. O funcionário nunca recebe o valor dos contratos, só a comissão dele.
- **Backup (só ADM)** — no Perfil: "Baixar backup" gera um arquivo .json com tudo; "Restaurar backup" volta tudo como
  estava no arquivo (pede para digitar RESTAURAR). Mostra a data do último backup e avisa quando passa de 7 dias.
- **Perfil** — foto opcional (aparece no painel e na lista), trocar a própria senha e sair.
- Funciona no celular (menu embaixo, botão de nova prospecção sempre à mão).

## Como rodar no seu computador

1. Instale o **Node.js 18+** e o **PostgreSQL**.
2. Crie o banco:
   ```bash
   psql -U postgres -c "CREATE DATABASE prospecta"
   ```
3. Copie `.env.example` para `.env` e preencha (principalmente `DATABASE_URL`, `JWT_SECRET` e `ADMIN_SENHA`).
4. Instale e rode:
   ```bash
   npm install
   npm start
   ```
5. Abra http://localhost:3000 e entre com `ADMIN_LOGIN` / `ADMIN_SENHA`.

As tabelas são criadas sozinhas na primeira vez. O administrador também é criado sozinho
(só se ainda não existir nenhum) — depois disso, mudar `ADMIN_SENHA` no `.env` não muda a senha;
troque pela tela de Perfil.

## Colocar no ar (para a equipe usar de qualquer lugar)

Uma opção gratuita/barata:

- **Banco:** Neon ou Supabase (PostgreSQL na nuvem). Copie a connection string para `DATABASE_URL` e use `PGSSL=true`.
- **Servidor:** Render ou Railway → novo Web Service apontando para o repositório,
  comando de start `npm start`, e as mesmas variáveis do `.env` (com `NODE_ENV=production`).

Use HTTPS em produção (Render/Railway já dão) — o cookie de login fica marcado como seguro.

## Estrutura

```
server.js        rotas da API (login, usuários, nichos, prospecções, painel)
db.js            conexão e criação das tabelas
public/
  index.html     telas
  style.css      visual (claro/escuro automático)
  app.js         lógica do front
```

## Segurança (o que já está feito)

- Senhas com bcrypt; login por cookie `httpOnly` com JWT (7 dias).
- Bloqueio temporário após várias senhas erradas.
- Funcionário desativado perde o acesso na hora, mesmo já logado.
- Rotas de usuários bloqueadas para quem não é ADM no servidor (não só escondidas na tela).
- Consultas SQL parametrizadas e textos escapados na tela.
