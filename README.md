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
