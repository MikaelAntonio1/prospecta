const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Os meses do relatório seguem o horário do Brasil (mude FUSO_HORARIO no .env se precisar)
const FUSO = /^[A-Za-z_]+\/[A-Za-z_]+$/.test(process.env.FUSO_HORARIO || '') ? process.env.FUSO_HORARIO : 'America/Recife';
// Bancos na nuvem (ex.: Neon) desligam quando ficam parados e fecham as conexões abertas.
// Sem este aviso, o Node entenderia isso como erro grave e o servidor cairia.
pool.on('error', (err) => console.warn('Conexão com o banco fechada (normal na nuvem):', err.message));

// O fuso é gravado no próprio banco (ALTER DATABASE, dentro do init), assim cada conexão nova já nasce
// com o horário certo. Antes era um "SET TIME ZONE" a cada conexão, que disparava um aviso
// (DeprecationWarning) no pg por rodar junto com outra consulta.

// Cria as tabelas (se ainda não existirem) e o primeiro login de administrador.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      login       TEXT NOT NULL UNIQUE,
      senha_hash  TEXT NOT NULL,
      papel       TEXT NOT NULL DEFAULT 'funcionario' CHECK (papel IN ('admin', 'gerente', 'funcionario')),
      foto        TEXT,
      ativo       BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS nichos (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      criado_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS nichos_nome_unico ON nichos (lower(nome));

    CREATE TABLE IF NOT EXISTS prospeccoes (
      id             SERIAL PRIMARY KEY,
      empresa        TEXT NOT NULL,
      nicho_id       INT REFERENCES nichos(id) ON DELETE SET NULL,
      status         TEXT NOT NULL DEFAULT 'pensando' CHECK (status IN ('aceitou', 'pensando', 'recusou')),
      telefone       TEXT,
      localidade     TEXT,
      instagram      TEXT,
      site           TEXT,
      outras_redes   TEXT,
      anotacoes      TEXT,
      usuario_id     INT NOT NULL REFERENCES usuarios(id),
      criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS prospeccoes_usuario ON prospeccoes (usuario_id);
    CREATE INDEX IF NOT EXISTS prospeccoes_data ON prospeccoes (criado_em DESC);

    -- Contratos fechados (só o ADM vê). Um contrato por empresa prospectada.
    CREATE TABLE IF NOT EXISTS contratos (
      id               SERIAL PRIMARY KEY,
      prospeccao_id    INT NOT NULL UNIQUE REFERENCES prospeccoes(id) ON DELETE CASCADE,
      projeto          TEXT,
      valor            NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
      comissao_manual  NUMERIC(12,2) CHECK (comissao_manual >= 0),  -- vazio = cálculo automático
      comissao_paga    BOOLEAN NOT NULL DEFAULT FALSE,
      fechado_em       DATE NOT NULL DEFAULT CURRENT_DATE,
      criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS contratos_data ON contratos (fechado_em DESC);
    -- comissão automática calculada no dia do registro (mudar a regra não mexe nos contratos antigos)
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS comissao_auto NUMERIC(12,2);
    -- cargos: admin (dono), gerente (sub-dono), funcionario
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check CHECK (papel IN ('admin', 'gerente', 'funcionario'));
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB NOT NULL DEFAULT '{}';
    -- comissão manual em porcentagem do valor do projeto (ex.: 15 = 15%)
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS comissao_pct NUMERIC(6,2) CHECK (comissao_pct >= 0 AND comissao_pct <= 100);

    -- Lembrete de retorno: dia para ligar de novo para a empresa
    ALTER TABLE prospeccoes ADD COLUMN IF NOT EXISTS retorno_em DATE;
    CREATE INDEX IF NOT EXISTS prospeccoes_retorno ON prospeccoes (retorno_em) WHERE retorno_em IS NOT NULL;

    -- Histórico: quem fez o quê e quando (o nome fica guardado mesmo se a pessoa for excluída)
    CREATE TABLE IF NOT EXISTS historico (
      id            SERIAL PRIMARY KEY,
      usuario_id    INT REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome  TEXT,
      tipo          TEXT NOT NULL,      -- prospeccao | contrato | equipe | sistema
      acao          TEXT NOT NULL,      -- criou | editou | excluiu | ...
      alvo_id       INT,
      descricao     TEXT NOT NULL,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS historico_data ON historico (criado_em DESC);

    -- Configurações do sistema (ex.: regra de comissão)
    CREATE TABLE IF NOT EXISTS config (
      chave  TEXT PRIMARY KEY,
      valor  JSONB NOT NULL
    );
    INSERT INTO config (chave, valor) VALUES ('comissao', '{"fixa": 40, "percentual": 20}')
    ON CONFLICT (chave) DO NOTHING;

    -- Problemas que as empresas têm (etiquetas criadas pela equipe, como os nichos)
    CREATE TABLE IF NOT EXISTS problemas (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      criado_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS problemas_nome_unico ON problemas (lower(nome));
    CREATE TABLE IF NOT EXISTS prospeccao_problemas (
      prospeccao_id  INT NOT NULL REFERENCES prospeccoes(id) ON DELETE CASCADE,
      problema_id    INT NOT NULL REFERENCES problemas(id) ON DELETE CASCADE,
      PRIMARY KEY (prospeccao_id, problema_id)
    );
  `);

  // fuso horário do banco (vale para todas as conexões novas)
  try {
    const { rows: [{ banco }] } = await pool.query('SELECT current_database() AS banco');
    await pool.query(`ALTER DATABASE "${banco.replace(/"/g, '""')}" SET timezone TO '${FUSO}'`);
    await pool.query(`SET TIME ZONE '${FUSO}'`); // a conexão que já está aberta agora
  } catch (err) {
    console.warn('Não consegui definir o fuso do banco (os meses podem usar UTC):', err.message);
  }

  // problemas: sem lista pronta, a equipe digita. Limpa os que ninguém usa.
  await pool.query(`DELETE FROM problemas pr
                     WHERE NOT EXISTS (SELECT 1 FROM prospeccao_problemas pp WHERE pp.problema_id = pr.id)`);

  const { rows } = await pool.query(`SELECT 1 FROM usuarios WHERE papel = 'admin' LIMIT 1`);
  if (rows.length === 0) {
    const login = (process.env.ADMIN_LOGIN || 'admin').trim().toLowerCase();
    const senha = process.env.ADMIN_SENHA;
    const nome = process.env.ADMIN_NOME || 'Administrador';
    if (!senha || senha.length < 6) {
      throw new Error('Defina ADMIN_SENHA (mínimo 6 caracteres) no .env para criar o primeiro administrador.');
    }
    await pool.query(
      `INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES ($1, $2, $3, 'admin')`,
      [nome, login, await bcrypt.hash(senha, 10)]
    );
    console.log(`Administrador criado: login "${login}"`);
  }
}

module.exports = { pool, init };
