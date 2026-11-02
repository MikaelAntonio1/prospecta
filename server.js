require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;
const PROD = process.env.NODE_ENV === 'production';
const STATUS = ['aceitou', 'pensando', 'recusou'];

if (!SECRET) {
  console.error('Defina JWT_SECRET no arquivo .env');
  process.exit(1);
}

app.set('trust proxy', 1);
const jsonNormal = express.json({ limit: '1mb' });
const jsonBackup = express.json({ limit: '60mb' }); // backup pode ter fotos
app.use((req, res, next) => (req.path === '/api/backup/restaurar' ? jsonBackup : jsonNormal)(req, res, next));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// "Estou vivo": para a hospedagem e para o robô que mantém o site acordado. Não usa o banco.
app.get('/saude', (req, res) => res.json({ ok: true }));

// ---------- utilitários ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const txt = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null;
const erro = (res, status, msg) => res.status(status).json({ erro: msg });

// ---------- histórico ----------
// Guarda quem fez o quê. Nunca derruba a ação principal se falhar.
async function registrar(req, tipo, acao, alvoId, descricao) {
  try {
    await pool.query(
      'INSERT INTO historico (usuario_id, usuario_nome, tipo, acao, alvo_id, descricao) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user?.id ?? null, req.user?.nome ?? null, tipo, acao, alvoId ?? null, String(descricao).slice(0, 1000)]
    );
  } catch (e) {
    console.warn('Não consegui registrar no histórico:', e.message);
  }
}
const reais = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const NOME_STATUS = { aceitou: 'Aceitou', pensando: 'Pensando', recusou: 'Recusou' };

// ---------- cargos e permissões ----------
// admin       = dono, acesso total
// gerente     = "sub-dono": vê tudo; só altera o que o admin liberar
// funcionario = prospecta e vê o próprio ganho
const PAPEIS = ['admin', 'gerente', 'funcionario'];
const PERMISSOES = ['contratos', 'regra', 'equipe', 'prospeccoes'];
const limparPermissoes = (p) => Object.fromEntries(PERMISSOES.map((k) => [k, Boolean(p && p[k])]));
const publico = (u) => ({
  id: u.id, nome: u.nome, login: u.login, papel: u.papel, foto: u.foto,
  verificado: Boolean(u.verificado), permissoes: limparPermissoes(u.permissoes),
  trocar_senha: Boolean(u.trocar_senha),
});
const veTudo = (u) => u.papel === 'admin' || u.papel === 'gerente';
const pode = (u, perm) => u.papel === 'admin' || (u.papel === 'gerente' && Boolean(u.permissoes?.[perm]));

const auth = wrap(async (req, res, next) => {
  let payload;
  try {
    payload = jwt.verify(req.cookies.token || '', SECRET);
  } catch {
    return erro(res, 401, 'Faça login para continuar.');
  }
  const { rows } = await pool.query(
    'SELECT id, nome, login, papel, foto, ativo, verificado, permissoes, trocar_senha FROM usuarios WHERE id = $1',
    [payload.id]
  );
  const u = rows[0];
  if (!u || !u.ativo) {
    res.clearCookie('token');
    return erro(res, 401, 'Seu acesso foi desativado.');
  }
  req.user = u;
  marcarVisto(u.id);
  next();
});

// online/offline: guarda quando a pessoa usou o sistema pela última vez (no máximo 1 gravação por minuto)
const ultimoVisto = new Map();
function marcarVisto(id) {
  const agora = Date.now();
  if (agora - (ultimoVisto.get(id) || 0) < 60e3) return;
  ultimoVisto.set(id, agora);
  pool.query('UPDATE usuarios SET visto_em = now() WHERE id = $1', [id]).catch(() => {});
}

// só o dono
const soAdmin = (req, res, next) =>
  req.user.papel === 'admin' ? next() : erro(res, 403, 'Somente o administrador pode fazer isso.');
// dono ou gerente (ver)
const soGestao = (req, res, next) =>
  veTudo(req.user) ? next() : erro(res, 403, 'Você não tem acesso a esta área.');
// dono, ou gerente com a permissão marcada (alterar)
const precisa = (perm, msg) => (req, res, next) =>
  pode(req.user, perm) ? next() : erro(res, 403, msg || 'Você pode ver, mas não alterar isso. Peça ao administrador.');

// ---------- login ----------
const tentativas = new Map(); // proteção simples contra chute de senha

app.post('/api/login', wrap(async (req, res) => {
  const t = tentativas.get(req.ip) || { n: 0, ate: 0 };
  if (t.ate > Date.now()) return erro(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');

  const login = String(req.body.login || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE login = $1', [login]);
  const u = rows[0];
  const ok = u && (await bcrypt.compare(senha, u.senha_hash));

  if (!ok) {
    t.n += 1;
    if (t.n >= 8) { t.ate = Date.now() + 15 * 60e3; t.n = 0; }
    tentativas.set(req.ip, t);
    return erro(res, 401, 'Login ou senha incorretos.');
  }
  if (!u.ativo) return erro(res, 403, 'Seu acesso foi desativado. Fale com o administrador.');

  tentativas.delete(req.ip);
  const token = jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 7 * 864e5 });
  res.json(publico(u));
}));

// ---------- nome do sistema (aparece até na tela de login, por isso é público) ----------
const NOME_PADRAO = 'Prospecta';
app.get('/api/marca', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT valor FROM config WHERE chave = 'marca'`);
  res.json({ nome: rows[0]?.valor?.nome || NOME_PADRAO });
}));
app.put('/api/marca', auth, soAdmin, wrap(async (req, res) => {
  const nome = txt(req.body.nome, 40);
  if (!nome || nome.length < 2) return erro(res, 400, 'O nome precisa ter pelo menos 2 letras.');
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ('marca', $1::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [JSON.stringify({ nome })]
  );
  await registrar(req, 'sistema', 'editou', null, `mudou o nome do sistema para “${nome}”`);
  res.json({ nome });
}));

app.post('/api/logout', wrap(async (req, res) => {
  try {
    const { id } = jwt.verify(req.cookies.token || '', SECRET);
    ultimoVisto.delete(id);
    await pool.query(`UPDATE usuarios SET visto_em = now() - interval '5 minutes' WHERE id = $1`, [id]);
  } catch { /* já estava sem login */ }
  res.clearCookie('token');
  res.json({ ok: true });
}));

// sinal de vida enquanto o sistema está aberto (para o "online" do ADM)
app.post('/api/ping', auth, (req, res) => res.json({ ok: true }));

// ---------- meu perfil ----------
app.get('/api/me', auth, (req, res) => res.json(publico(req.user)));

app.put('/api/me/foto', auth, wrap(async (req, res) => {
  const foto = req.body.foto ?? null;
  const valida = typeof foto === 'string'
    && foto.length < 500000
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto);
  if (foto !== null && !valida) return erro(res, 400, 'Imagem inválida ou grande demais.');
  await pool.query('UPDATE usuarios SET foto = $1 WHERE id = $2', [foto, req.user.id]);
  res.json({ foto });
}));

app.put('/api/me/senha', auth, wrap(async (req, res) => {
  const { atual, nova } = req.body;
  if (typeof nova !== 'string' || nova.length < 6) return erro(res, 400, 'A nova senha precisa ter pelo menos 6 caracteres.');
  const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.user.id]);
  // com senha provisória a pessoa acabou de entrar com ela, então não precisa digitar de novo
  if (!req.user.trocar_senha && !(await bcrypt.compare(String(atual || ''), rows[0].senha_hash))) {
    return erro(res, 400, 'Senha atual incorreta.');
  }
  if (await bcrypt.compare(nova, rows[0].senha_hash)) return erro(res, 400, 'Escolha uma senha diferente da atual.');
  await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE WHERE id = $2', [await bcrypt.hash(nova, 10), req.user.id]);
  await registrar(req, 'equipe', 'senha', req.user.id, 'trocou a própria senha');
  res.json({ ok: true });
}));

// ---------- equipe (nomes e fotos, para todos) ----------
app.get('/api/equipe', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, foto, ativo, papel, verificado FROM usuarios ORDER BY nome');
  res.json(rows);
}));

// ---------- usuários ----------
// Admin: tudo. Gerente com a permissão "equipe": cria, edita e desativa só funcionários.
// Cargo, permissões e selo de verificado: só o admin muda.
const LOGIN_OK = /^[a-z0-9._-]{3,40}$/;
const NOME_PAPEL = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário' };
const NOME_PERM = { contratos: 'contratos', regra: 'regra de comissão', equipe: 'equipe', prospeccoes: 'prospecções de todos' };
const CAMPOS_U = 'id, nome, login, papel, foto, ativo, verificado, permissoes';

app.get('/api/usuarios', auth, soGestao, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.nome, u.login, u.papel, u.foto, u.ativo, u.verificado, u.permissoes, u.criado_em,
           u.visto_em, u.trocar_senha, COUNT(p.id)::int AS prospeccoes
      FROM usuarios u
      LEFT JOIN prospeccoes p ON p.usuario_id = u.id
     GROUP BY u.id
     ORDER BY u.ativo DESC, u.papel, u.nome`);
  const adm = req.user.papel === 'admin';
  res.json(rows.map(({ visto_em, trocar_senha, ...u }) => ({
    ...u,
    permissoes: limparPermissoes(u.permissoes),
    // online/offline e senha provisória: só o ADM vê
    ...(adm ? { visto_em, trocar_senha, online: Boolean(visto_em && Date.now() - new Date(visto_em) < 2.5 * 60e3) } : {}),
  })));
}));

// ADM gera uma senha provisória (a senha antiga não dá para ver: o sistema só guarda ela criptografada)
const LETRAS_SENHA = 'abcdefghjkmnpqrstuvwxyz23456789';
app.post('/api/usuarios/:id/senha-provisoria', auth, soAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT id, nome FROM usuarios WHERE id = $1', [id]);
  if (!rows[0]) return erro(res, 404, 'Usuário não encontrado.');
  if (id === req.user.id) return erro(res, 400, 'Para a sua própria senha, use “Minha conta”.');
  const bytes = crypto.randomBytes(8);
  const senha = Array.from(bytes, (b) => LETRAS_SENHA[b % LETRAS_SENHA.length]).join('');
  await pool.query('UPDATE usuarios SET senha_hash = $1, trocar_senha = TRUE WHERE id = $2', [await bcrypt.hash(senha, 10), id]);
  await registrar(req, 'equipe', 'senha', id, `gerou uma senha provisória para ${rows[0].nome}`);
  res.json({ senha });
}));

app.post('/api/usuarios', auth, precisa('equipe', 'Você não tem permissão para criar logins.'), wrap(async (req, res) => {
  const ehAdmin = req.user.papel === 'admin';
  const nome = txt(req.body.nome, 80);
  const login = (txt(req.body.login, 40) || '').toLowerCase();
  const senha = req.body.senha;
  // gerente só cria funcionário
  const papel = ehAdmin && PAPEIS.includes(req.body.papel) ? req.body.papel : 'funcionario';
  const permissoes = ehAdmin && papel === 'gerente' ? limparPermissoes(req.body.permissoes) : limparPermissoes({});
  const verificado = ehAdmin ? Boolean(req.body.verificado) : false;

  if (!nome || !login) return erro(res, 400, 'Preencha o nome e o login.');
  if (!LOGIN_OK.test(login)) return erro(res, 400, 'Login: de 3 a 40 caracteres, só letras, números, ponto, hífen ou _.');
  if (typeof senha !== 'string' || senha.length < 6) return erro(res, 400, 'A senha precisa ter pelo menos 6 caracteres.');

  try {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, login, senha_hash, papel, permissoes, verificado, trocar_senha) VALUES ($1, $2, $3, $4, $5::jsonb, $6, TRUE)
       RETURNING ${CAMPOS_U}`,
      [nome, login, await bcrypt.hash(senha, 10), papel, JSON.stringify(permissoes), verificado]
    );
    await registrar(req, 'equipe', 'criou', rows[0].id,
      `criou o login de ${nome} (${login}) como ${NOME_PAPEL[papel]}${verificado ? ', com selo de verificado' : ''}`);
    res.status(201).json(publico(rows[0]));
  } catch (e) {
    if (e.code === '23505') return erro(res, 409, 'Já existe alguém com esse login.');
    throw e;
  }
}));

app.put('/api/usuarios/:id', auth, precisa('equipe', 'Você não tem permissão para editar a equipe.'), wrap(async (req, res) => {
  const ehAdmin = req.user.papel === 'admin';
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  const u = rows[0];
  if (!u) return erro(res, 404, 'Usuário não encontrado.');
  if (!ehAdmin && u.papel !== 'funcionario') return erro(res, 403, 'Só o administrador pode editar administradores e gerentes.');

  const b = req.body;
  const nome = b.nome !== undefined ? txt(b.nome, 80) : u.nome;
  const login = b.login !== undefined ? (txt(b.login, 40) || '').toLowerCase() : u.login;
  const papel = ehAdmin && b.papel !== undefined && PAPEIS.includes(b.papel) ? b.papel : u.papel;
  const ativo = b.ativo !== undefined ? Boolean(b.ativo) : u.ativo;
  const verificado = ehAdmin && b.verificado !== undefined ? Boolean(b.verificado) : Boolean(u.verificado);
  let permissoes = limparPermissoes(u.permissoes);
  if (ehAdmin && b.permissoes !== undefined) permissoes = limparPermissoes(b.permissoes);
  if (papel !== 'gerente') permissoes = limparPermissoes({});
  const senha = b.senha;

  if (!nome) return erro(res, 400, 'O nome não pode ficar vazio.');
  if (!LOGIN_OK.test(login)) return erro(res, 400, 'Login: de 3 a 40 caracteres, só letras, números, ponto, hífen ou _.');
  if (id === req.user.id && (!ativo || papel !== 'admin')) {
    return erro(res, 400, 'Você não pode desativar nem tirar o seu próprio acesso de administrador.');
  }
  if (senha && (typeof senha !== 'string' || senha.length < 6)) return erro(res, 400, 'A senha precisa ter pelo menos 6 caracteres.');
  const hash = senha ? await bcrypt.hash(senha, 10) : u.senha_hash;

  try {
    const r = await pool.query(
      `UPDATE usuarios SET nome = $1, login = $2, papel = $3, ativo = $4, senha_hash = $5,
              verificado = $6, permissoes = $7::jsonb,
              trocar_senha = CASE WHEN $9 THEN TRUE ELSE trocar_senha END WHERE id = $8
       RETURNING ${CAMPOS_U}`,
      [nome, login, papel, ativo, hash, verificado, JSON.stringify(permissoes), id, Boolean(senha) && id !== req.user.id]
    );
    const mud = [];
    if (nome !== u.nome) mud.push(`nome “${u.nome}” → “${nome}”`);
    if (login !== u.login) mud.push(`login ${u.login} → ${login}`);
    if (papel !== u.papel) mud.push(`cargo ${NOME_PAPEL[u.papel]} → ${NOME_PAPEL[papel]}`);
    const antes = limparPermissoes(u.permissoes);
    const liberou = PERMISSOES.filter((k) => permissoes[k] && !antes[k]).map((k) => NOME_PERM[k]);
    const tirou = PERMISSOES.filter((k) => !permissoes[k] && antes[k]).map((k) => NOME_PERM[k]);
    if (liberou.length) mud.push(`liberou ${liberou.join(', ')}`);
    if (tirou.length) mud.push(`tirou ${tirou.join(', ')}`);
    if (verificado !== Boolean(u.verificado)) mud.push(verificado ? 'deu o selo de verificado' : 'tirou o selo de verificado');
    if (ativo !== u.ativo) mud.push(ativo ? 'reativou o acesso' : 'desativou o acesso');
    if (senha) mud.push('trocou a senha');
    if (mud.length) await registrar(req, 'equipe', 'editou', id, `editou ${nome}: ${mud.join('; ')}`);
    res.json(publico(r.rows[0]));
  } catch (e) {
    if (e.code === '23505') return erro(res, 409, 'Já existe alguém com esse login.');
    throw e;
  }
}));

app.delete('/api/usuarios/:id', auth, precisa('equipe', 'Você não tem permissão para excluir logins.'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return erro(res, 400, 'Você não pode excluir o seu próprio usuário.');
  const alvo = (await pool.query('SELECT papel FROM usuarios WHERE id = $1', [id])).rows[0];
  if (!alvo) return erro(res, 404, 'Usuário não encontrado.');
  if (req.user.papel !== 'admin' && alvo.papel !== 'funcionario') return erro(res, 403, 'Só o administrador pode excluir administradores e gerentes.');
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM prospeccoes WHERE usuario_id = $1', [id]);
  if (rows[0].n > 0) {
    return erro(res, 409, `Essa pessoa tem ${rows[0].n} prospecção(ões). Desative o acesso em vez de excluir, para não perder o histórico.`);
  }
  const quem = (await pool.query('SELECT nome, login FROM usuarios WHERE id = $1', [id])).rows[0];
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
  await registrar(req, 'equipe', 'excluiu', id, `excluiu o login de ${quem.nome} (${quem.login})`);
  res.json({ ok: true });
}));

// ---------- nichos ----------
app.get('/api/nichos', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.id, n.nome, COUNT(p.id)::int AS total
      FROM nichos n LEFT JOIN prospeccoes p ON p.nicho_id = n.id
     GROUP BY n.id ORDER BY lower(n.nome)`);
  res.json(rows);
}));

// Excluir nicho: só o ADM. As prospecções continuam, só ficam "sem nicho".
app.delete('/api/nichos/:id', auth, soAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const n = (await pool.query(`
    SELECT n.nome, COUNT(p.id)::int AS total
      FROM nichos n LEFT JOIN prospeccoes p ON p.nicho_id = n.id
     WHERE n.id = $1 GROUP BY n.id`, [id])).rows[0];
  if (!n) return erro(res, 404, 'Nicho não encontrado.');
  await pool.query('UPDATE prospeccoes SET nicho_id = NULL WHERE nicho_id = $1', [id]);
  await pool.query('DELETE FROM nichos WHERE id = $1', [id]);
  await registrar(req, 'sistema', 'excluiu', id,
    `excluiu o nicho “${n.nome}”${n.total ? ` (${n.total} prospecç${n.total === 1 ? 'ão ficou' : 'ões ficaram'} sem nicho)` : ''}`);
  res.json({ ok: true, prospeccoes: n.total });
}));

// Devolve o id pelo nome; se ainda não existe, cria e já fica salvo para todos.
// Serve para nichos e problemas ("Barbearia" e "barbearia" são o mesmo).
async function idPorNome(tabela, nome, usuarioId) {
  if (!['nichos', 'problemas'].includes(tabela)) throw new Error('tabela inválida');
  nome = txt(nome, 60);
  if (!nome) return null;
  const buscar = () => pool.query(`SELECT id FROM ${tabela} WHERE lower(nome) = lower($1)`, [nome]);
  let r = await buscar();
  if (r.rows[0]) return r.rows[0].id;
  r = await pool.query(
    `INSERT INTO ${tabela} (nome, criado_por) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
    [nome, usuarioId]
  );
  if (r.rows[0]) return r.rows[0].id;
  return (await buscar()).rows[0].id;
}
const nichoId = (nome, usuarioId) => idPorNome('nichos', nome, usuarioId);

// ---------- problemas (o que as empresas precisam) ----------
app.get('/api/problemas', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pr.id, pr.nome, COUNT(pp.prospeccao_id)::int AS total
      FROM problemas pr JOIN prospeccao_problemas pp ON pp.problema_id = pr.id
     GROUP BY pr.id ORDER BY total DESC, lower(pr.nome)`); // só os que alguém já usou
  res.json(rows);
}));

// troca a lista de problemas de uma prospecção
async function salvarProblemas(prospeccaoId, nomes, usuarioId) {
  if (!Array.isArray(nomes)) return;
  const ids = [];
  for (const nome of nomes.slice(0, 12)) {
    const id = await idPorNome('problemas', nome, usuarioId);
    if (id && !ids.includes(id)) ids.push(id);
  }
  await pool.query('DELETE FROM prospeccao_problemas WHERE prospeccao_id = $1', [prospeccaoId]);
  for (const id of ids) {
    await pool.query(
      'INSERT INTO prospeccao_problemas (prospeccao_id, problema_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [prospeccaoId, id]
    );
  }
}

// ---------- período (filtro de ano, mês ou datas) ----------
// Lê ?de=AAAA-MM-DD&ate=AAAA-MM-DD e devolve o trecho de SQL (com $n) para a coluna pedida.
const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
function periodo(req, coluna, params) {
  const cond = [];
  if (dataOk(req.query.de)) { params.push(req.query.de); cond.push(`${coluna} >= $${params.length}::date`); }
  if (dataOk(req.query.ate)) { params.push(req.query.ate); cond.push(`${coluna} < ($${params.length}::date + 1)`); }
  return cond.length ? ' AND ' + cond.join(' AND ') : '';
}

// anos que têm dados (para o filtro)
app.get('/api/anos', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ano FROM (
      SELECT EXTRACT(YEAR FROM criado_em)::int AS ano FROM prospeccoes
      UNION SELECT EXTRACT(YEAR FROM fechado_em)::int FROM contratos
      UNION SELECT EXTRACT(YEAR FROM now())::int
    ) a ORDER BY ano DESC`);
  res.json(rows.map((r) => r.ano));
}));

// ---------- prospecções ----------
const SELECT_P = `
  SELECT p.*, n.nome AS nicho, u.nome AS usuario_nome,
         to_char(p.retorno_em, 'YYYY-MM-DD') AS retorno,
         (p.retorno_em - CURRENT_DATE) AS retorno_dias,
         COALESCE((SELECT json_agg(pr.nome ORDER BY lower(pr.nome))
                     FROM prospeccao_problemas pp JOIN problemas pr ON pr.id = pp.problema_id
                    WHERE pp.prospeccao_id = p.id), '[]'::json) AS problemas
    FROM prospeccoes p
    LEFT JOIN nichos n ON n.id = p.nicho_id
    JOIN usuarios u ON u.id = p.usuario_id`;

const CAMPOS = {
  empresa: 120, telefone: 40, localidade: 150, instagram: 200,
  site: 200, outras_redes: 400, anotacoes: 5000,
};

app.get('/api/prospeccoes', auth, wrap(async (req, res) => {
  const cond = [];
  const params = [];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace('?', '$' + params.length)); };

  const q = txt(req.query.q, 100);
  if (q) {
    params.push('%' + q + '%');
    const n = '$' + params.length;
    cond.push(`(p.empresa ILIKE ${n} OR p.telefone ILIKE ${n} OR p.localidade ILIKE ${n} OR n.nome ILIKE ${n})`);
  }
  if (STATUS.includes(req.query.status)) add('p.status = ?', req.query.status);
  if (req.query.nicho === 'sem') cond.push('p.nicho_id IS NULL');
  else if (req.query.nicho) add('p.nicho_id = ?', Number(req.query.nicho));
  if (req.query.usuario) add('p.usuario_id = ?', Number(req.query.usuario));
  const per = periodo(req, 'p.criado_em', params); // filtro de ano / mês / datas
  if (per) cond.push(per.replace(/^ AND /, ''));

  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await pool.query(`${SELECT_P} ${where} ORDER BY p.criado_em DESC LIMIT 1000`, params);

  // ADM e gerente recebem os dados de contrato junto com a lista
  if (veTudo(req.user)) {
    const ctr = (await pool.query('SELECT id, prospeccao_id, valor::float8 AS valor FROM contratos')).rows;
    const porProsp = new Map(ctr.map((c) => [c.prospeccao_id, c]));
    for (const p of rows) {
      const c = porProsp.get(p.id);
      if (c) { p.contrato_id = c.id; p.contrato_valor = c.valor; }
    }
  }
  res.json(rows);
}));

// data de retorno: "AAAA-MM-DD" ou vazio (sem retorno). undefined = inválida
function lerRetorno(v) {
  if (v === undefined || v === null || v === '') return null;
  return dataOk(v) ? v : undefined;
}
const deQuem = (req, p) => (p.usuario_id === req.user.id ? '' : ` (de ${p.usuario_nome})`);

async function buscarProsp(id) {
  const { rows } = await pool.query(`${SELECT_P} WHERE p.id = $1`, [id]);
  return rows[0];
}

// ---------- empresa repetida: mesmo nome OU mesmo telefone ----------
// nome: sem diferença de maiúscula, acento e espaços extras. telefone: só os números, sem o 55 do Brasil.
const SQL_NOME = `regexp_replace(translate(lower(trim(%s)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\\s+', ' ', 'g')`;
const SQL_FONE = `regexp_replace(regexp_replace(coalesce(%s, ''), '\\D', '', 'g'), '^(55(?=\\d{10,11}$)|0+)', '')`;
async function acharRepetidas(empresa, telefone, ignorarId = null) {
  const nome = (empresa || '').trim();
  const fone = String(telefone || '').replace(/\D/g, '');
  if (!nome && fone.length < 8) return [];
  const { rows } = await pool.query(`
    SELECT p.id, p.empresa, p.telefone, p.status, p.criado_em, u.nome AS usuario_nome,
           (${SQL_NOME.replace('%s', 'p.empresa')} = ${SQL_NOME.replace('%s', '$1')}) AS mesmo_nome,
           (length(${SQL_FONE.replace('%s', '$2')}) >= 8 AND ${SQL_FONE.replace('%s', 'p.telefone')} = ${SQL_FONE.replace('%s', '$2')}) AS mesmo_fone
      FROM prospeccoes p
      LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE ($3::int IS NULL OR p.id <> $3)
       AND ((${SQL_NOME.replace('%s', 'p.empresa')} = ${SQL_NOME.replace('%s', '$1')} AND $1 <> '')
         OR (length(${SQL_FONE.replace('%s', '$2')}) >= 8 AND ${SQL_FONE.replace('%s', 'p.telefone')} = ${SQL_FONE.replace('%s', '$2')}))
     ORDER BY p.criado_em DESC
     LIMIT 5`, [nome, fone, ignorarId]);
  return rows;
}
const RESUMO_REP = (r) => ({
  id: r.id, empresa: r.empresa, telefone: r.telefone, status: r.status,
  criado_em: r.criado_em, usuario_nome: r.usuario_nome, mesmo_nome: r.mesmo_nome, mesmo_fone: r.mesmo_fone,
});

// aviso enquanto a pessoa digita
app.get('/api/prospeccoes/repetidas', auth, wrap(async (req, res) => {
  const ignorar = Number(req.query.ignorar) || null;
  const rows = await acharRepetidas(txt(req.query.empresa, 200), txt(req.query.telefone, 40), ignorar);
  res.json(rows.map(RESUMO_REP));
}));

app.post('/api/prospeccoes', auth, wrap(async (req, res) => {
  const b = req.body;
  const d = {};
  for (const [c, max] of Object.entries(CAMPOS)) d[c] = txt(b[c], max);
  if (!d.empresa) return erro(res, 400, 'Coloque o nome da empresa.');
  if (!STATUS.includes(b.status)) return erro(res, 400, 'Escolha se aceitou, recusou ou está pensando.');

  const retorno = lerRetorno(b.retorno_em);
  if (retorno === undefined) return erro(res, 400, 'Data de retorno inválida.');
  // já existe? avisa e só salva se a pessoa confirmar
  if (!b.confirmar_repetida) {
    const rep = await acharRepetidas(d.empresa, d.telefone);
    if (rep.length) {
      return res.status(409).json({ erro: 'Essa empresa já foi cadastrada.', repetidas: rep.map(RESUMO_REP) });
    }
  }
  const nid = await nichoId(b.nicho, req.user.id);
  const { rows } = await pool.query(
    `INSERT INTO prospeccoes (empresa, nicho_id, status, telefone, localidade, instagram, site, outras_redes, anotacoes, usuario_id, retorno_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date) RETURNING id`,
    [d.empresa, nid, b.status, d.telefone, d.localidade, d.instagram, d.site, d.outras_redes, d.anotacoes, req.user.id, retorno]
  );
  await salvarProblemas(rows[0].id, b.problemas, req.user.id);
  await registrar(req, 'prospeccao', 'criou', rows[0].id,
    `cadastrou ${d.empresa} (${NOME_STATUS[b.status]})${retorno ? ` com retorno para ${dataBR(retorno)}` : ''}`);
  res.status(201).json(await buscarProsp(rows[0].id));
}));

app.put('/api/prospeccoes/:id', auth, wrap(async (req, res) => {
  const atual = await buscarProsp(Number(req.params.id));
  if (!atual) return erro(res, 404, 'Prospecção não encontrada.');
  if (!pode(req.user, 'prospeccoes') && atual.usuario_id !== req.user.id) {
    return erro(res, 403, 'Você só pode alterar as suas prospecções.');
  }
  const b = req.body;
  const d = {};
  for (const [c, max] of Object.entries(CAMPOS)) d[c] = c in b ? txt(b[c], max) : atual[c];
  if (!d.empresa) return erro(res, 400, 'Coloque o nome da empresa.');
  const status = 'status' in b ? b.status : atual.status;
  if (!STATUS.includes(status)) return erro(res, 400, 'Status inválido.');
  const nid = 'nicho' in b ? await nichoId(b.nicho, req.user.id) : atual.nicho_id;
  // retorno: se a empresa aceitou ou recusou (e ninguém mandou outra data), o lembrete sai sozinho
  let retorno = atual.retorno;
  if ('retorno_em' in b) {
    retorno = lerRetorno(b.retorno_em);
    if (retorno === undefined) return erro(res, 400, 'Data de retorno inválida.');
  } else if (status !== atual.status && status !== 'pensando') {
    retorno = null;
  }
  const encerrou = !('retorno_em' in b) && atual.retorno && !retorno;

  await pool.query(
    `UPDATE prospeccoes SET empresa=$1, nicho_id=$2, status=$3, telefone=$4, localidade=$5, instagram=$6,
            site=$7, outras_redes=$8, anotacoes=$9, retorno_em=$10::date, atualizado_em=now() WHERE id=$11`,
    [d.empresa, nid, status, d.telefone, d.localidade, d.instagram, d.site, d.outras_redes, d.anotacoes, retorno, atual.id]
  );
  const antesProb = JSON.stringify(atual.problemas || []);
  if ('problemas' in b) await salvarProblemas(atual.id, b.problemas, req.user.id);
  const novo = await buscarProsp(atual.id);

  // o que mudou, em português
  const mud = [];
  if (status !== atual.status) mud.push(`resultado ${NOME_STATUS[atual.status]} → ${NOME_STATUS[status]}`);
  if (retorno !== atual.retorno) {
    if (retorno) mud.push(`retorno para ${dataBR(retorno)}`);
    else if (b.retorno_feito) mud.push('retorno feito');
    else if (encerrou) mud.push('retorno encerrado');
    else mud.push('tirou o retorno');
  }
  if (d.empresa !== atual.empresa) mud.push(`nome “${atual.empresa}” → “${d.empresa}”`);
  const campos = { telefone: 'número', localidade: 'localidade', instagram: 'Instagram', site: 'site', outras_redes: 'outras redes', anotacoes: 'anotações' };
  const outros = Object.keys(campos).filter((c) => (d[c] || null) !== (atual[c] || null)).map((c) => campos[c]);
  if (nid !== atual.nicho_id) outros.unshift('nicho');
  if (JSON.stringify(novo.problemas || []) !== antesProb) outros.push('problemas');
  if (outros.length) mud.push(`mudou ${outros.join(', ')}`);
  if (mud.length) {
    await registrar(req, 'prospeccao', b.retorno_feito ? 'retorno' : 'editou', atual.id,
      `${novo.empresa}${deQuem(req, atual)}: ${mud.join('; ')}`);
  }
  res.json(novo);
}));

app.delete('/api/prospeccoes/:id', auth, wrap(async (req, res) => {
  const atual = await buscarProsp(Number(req.params.id));
  if (!atual) return erro(res, 404, 'Prospecção não encontrada.');
  if (!pode(req.user, 'prospeccoes') && atual.usuario_id !== req.user.id) {
    return erro(res, 403, 'Você só pode excluir as suas prospecções.');
  }
  // apagar a prospecção apaga junto o contrato: isso só quem pode mexer em contratos
  const ctr = (await pool.query('SELECT valor::float8 AS valor FROM contratos WHERE prospeccao_id = $1', [atual.id])).rows[0];
  if (ctr && !pode(req.user, 'contratos')) {
    return erro(res, 409, 'Essa empresa já tem contrato registrado. Só o administrador pode excluir.');
  }
  await pool.query('DELETE FROM prospeccoes WHERE id = $1', [atual.id]);
  await registrar(req, 'prospeccao', 'excluiu', atual.id,
    `excluiu ${atual.empresa}${deQuem(req, atual)}${ctr ? ` e o contrato de ${reais(ctr.valor)}` : ''}`);
  res.json({ ok: true });
}));

// ---------- retornos (lembretes de ligar de novo) ----------
// Atrasados, de hoje e dos próximos 7 dias. Funcionário vê os dele; gestão pode ver os da equipe (?todos=1).
app.get('/api/retornos', auth, wrap(async (req, res) => {
  const todos = req.query.todos === '1' && veTudo(req.user);
  const params = [];
  let filtro = '';
  if (!todos) { params.push(req.user.id); filtro = 'AND p.usuario_id = $1'; }
  const { rows } = await pool.query(
    `${SELECT_P} WHERE p.retorno_em IS NOT NULL AND p.retorno_em <= CURRENT_DATE + 7 ${filtro}
     ORDER BY p.retorno_em, p.empresa`, params);
  const atrasados = rows.filter((r) => r.retorno_dias < 0).length;
  const hoje = rows.filter((r) => r.retorno_dias === 0).length;
  res.json({ itens: rows, atrasados, hoje });
}));

// ---------- painel ----------
app.get('/api/painel', auth, wrap(async (req, res) => {
  const p1 = [];
  const per1 = periodo(req, 'p.criado_em', p1);
  // ranking: funcionários ativos sempre aparecem; ADM e gerente aparecem quando prospectaram
  const ranking = (await pool.query(`
    SELECT u.id, u.nome, u.foto, u.verificado, u.papel,
           COUNT(p.id)::int AS total,
           COUNT(p.id) FILTER (WHERE p.status = 'aceitou')::int  AS aceitou,
           COUNT(p.id) FILTER (WHERE p.status = 'pensando')::int AS pensando,
           COUNT(p.id) FILTER (WHERE p.status = 'recusou')::int  AS recusou
      FROM usuarios u
      LEFT JOIN prospeccoes p ON p.usuario_id = u.id ${per1}
     GROUP BY u.id
    HAVING (u.ativo AND u.papel = 'funcionario') OR COUNT(p.id) > 0
     ORDER BY total DESC, aceitou DESC, u.nome`, p1)).rows;

  const nichos = await nichosNoPeriodo(req);

  // totais: todas as prospecções do período, de qualquer cargo
  const p2 = [];
  const per2 = periodo(req, 'p.criado_em', p2);
  const totais = (await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE p.status = 'aceitou')::int  AS aceitou,
           COUNT(*) FILTER (WHERE p.status = 'pensando')::int AS pensando,
           COUNT(*) FILTER (WHERE p.status = 'recusou')::int  AS recusou
      FROM prospeccoes p WHERE TRUE ${per2}`, p2)).rows[0];

  res.json({ totais, ranking, nichos });
}));

// ---------- nichos no período (painel mostra o top 5; a aba Nichos mostra todos) ----------
async function nichosNoPeriodo(req) {
  const p = [];
  const per = periodo(req, 'p.criado_em', p);
  const nichos = (await pool.query(`
    SELECT n.id, COALESCE(n.nome, 'Sem nicho') AS nome,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE p.status = 'aceitou')::int  AS aceitou,
           COUNT(*) FILTER (WHERE p.status = 'pensando')::int AS pensando,
           COUNT(*) FILTER (WHERE p.status = 'recusou')::int  AS recusou,
           MAX(p.criado_em) AS ultima
      FROM prospeccoes p LEFT JOIN nichos n ON n.id = p.nicho_id
     WHERE TRUE ${per}
     GROUP BY n.id, n.nome ORDER BY total DESC, lower(COALESCE(n.nome, '')) `, p)).rows;

  // quem mais prospectou em cada nicho
  const p2 = [];
  const per2 = periodo(req, 'p.criado_em', p2);
  const pessoas = (await pool.query(`
    SELECT p.nicho_id, u.id, u.nome, COUNT(*)::int AS total
      FROM prospeccoes p JOIN usuarios u ON u.id = p.usuario_id
     WHERE TRUE ${per2}
     GROUP BY p.nicho_id, u.id, u.nome ORDER BY total DESC`, p2)).rows;
  for (const n of nichos) {
    const top = pessoas.find((x) => (x.nicho_id ?? null) === (n.id ?? null));
    n.top = top ? { id: top.id, nome: top.nome, total: top.total } : null;
  }
  return nichos;
}
app.get('/api/painel/nichos', auth, wrap(async (req, res) => {
  res.json(await nichosNoPeriodo(req));
}));

// ---------- relatório mês a mês (quem mais prospectou em cada mês) ----------
// ?ano=2026 → os 12 meses daquele ano · ?ano=todos → todos os meses que têm dados, de todos os anos
app.get('/api/painel/meses', auth, wrap(async (req, res) => {
  const ano = /^\d{4}$/.test(req.query.ano || '') ? Number(req.query.ano) : null;
  const params = [];
  let filtro = '';
  if (ano) {
    params.push(`${ano}-01-01`, `${ano + 1}-01-01`);
    filtro = 'WHERE p.criado_em >= $1::date AND p.criado_em < $2::date';
  }
  const linhas = (await pool.query(`
    SELECT to_char(p.criado_em, 'YYYY-MM') AS mes, u.id, u.nome,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE p.status = 'aceitou')::int  AS aceitou,
           COUNT(*) FILTER (WHERE p.status = 'pensando')::int AS pensando,
           COUNT(*) FILTER (WHERE p.status = 'recusou')::int  AS recusou
      FROM prospeccoes p JOIN usuarios u ON u.id = p.usuario_id
      ${filtro}
     GROUP BY 1, 2, 3`, params)).rows;

  const mapa = new Map();
  for (const l of linhas) {
    const m = mapa.get(l.mes) || { mes: l.mes, total: 0, aceitou: 0, pensando: 0, recusou: 0, pessoas: [] };
    m.total += l.total; m.aceitou += l.aceitou; m.pensando += l.pensando; m.recusou += l.recusou;
    m.pessoas.push({ id: l.id, nome: l.nome, total: l.total, aceitou: l.aceitou });
    mapa.set(l.mes, m);
  }
  let meses;
  if (ano) {
    // os 12 meses do ano, até o mês atual quando for o ano corrente
    const agora = new Date();
    const ultimo = ano === agora.getFullYear() ? agora.getMonth() + 1 : 12;
    meses = [];
    for (let m = 1; m <= ultimo; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`;
      meses.push(mapa.get(k) || { mes: k, total: 0, aceitou: 0, pensando: 0, recusou: 0, pessoas: [] });
    }
  } else {
    meses = [...mapa.values()];
  }
  for (const m of meses) m.pessoas.sort((a, b) => b.total - a.total || b.aceitou - a.aceitou);
  meses.sort((a, b) => (a.mes < b.mes ? 1 : -1)); // mais recente primeiro
  res.json(meses);
}));

// ---------- observações: anotações e problemas em comum ----------
app.get('/api/observacoes', auth, wrap(async (req, res) => {
  // filtros que valem para tudo (período, nicho, busca)
  const base = (params) => {
    let sql = periodo(req, 'p.criado_em', params);
    if (req.query.nicho) { params.push(Number(req.query.nicho)); sql += ` AND p.nicho_id = $${params.length}`; }
    const q = txt(req.query.q, 100);
    if (q) { params.push('%' + q + '%'); sql += ` AND (p.empresa ILIKE $${params.length} OR p.anotacoes ILIKE $${params.length})`; }
    return sql;
  };

  const pt = [];
  const totalEmpresas = (await pool.query(`SELECT COUNT(*)::int AS n FROM prospeccoes p WHERE TRUE ${base(pt)}`, pt)).rows[0].n;

  const pr = [];
  const problemas = (await pool.query(`
    SELECT pb.id, pb.nome, COUNT(DISTINCT p.id)::int AS total,
           COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'aceitou')::int AS aceitou
      FROM prospeccoes p
      JOIN prospeccao_problemas pp ON pp.prospeccao_id = p.id
      JOIN problemas pb ON pb.id = pp.problema_id
     WHERE TRUE ${base(pr)}
     GROUP BY pb.id ORDER BY total DESC, lower(pb.nome) LIMIT 30`, pr)).rows;

  // em quais nichos cada problema aparece mais
  const pn = [];
  const porNicho = (await pool.query(`
    SELECT pp.problema_id, COALESCE(n.nome, 'Sem nicho') AS nicho, COUNT(*)::int AS total
      FROM prospeccoes p
      JOIN prospeccao_problemas pp ON pp.prospeccao_id = p.id
      LEFT JOIN nichos n ON n.id = p.nicho_id
     WHERE TRUE ${base(pn)}
     GROUP BY 1, 2 ORDER BY total DESC`, pn)).rows;
  for (const p of problemas) {
    p.nichos = porNicho.filter((x) => x.problema_id === p.id).slice(0, 3).map(({ nicho, total }) => ({ nicho, total }));
  }

  const pi = [];
  let filtroItens = base(pi);
  if (req.query.problema) {
    pi.push(Number(req.query.problema));
    filtroItens += ` AND EXISTS (SELECT 1 FROM prospeccao_problemas x WHERE x.prospeccao_id = p.id AND x.problema_id = $${pi.length})`;
  }
  const itens = (await pool.query(`
    ${SELECT_P}
     WHERE (COALESCE(p.anotacoes, '') <> '' OR EXISTS (SELECT 1 FROM prospeccao_problemas y WHERE y.prospeccao_id = p.id))
       ${filtroItens}
     ORDER BY p.atualizado_em DESC LIMIT 300`, pi)).rows;

  res.json({ totalEmpresas, problemas, itens });
}));

// ---------- meus ganhos (funcionário vê a própria comissão) ----------
// Só mostra o que o ADM já registrou como contrato. Não mostra o valor do projeto, só a comissão.
app.get('/api/me/ganhos', auth, wrap(async (req, res) => {
  if (req.user.papel === 'admin') return res.json({ contratos: [], totais: null });
  const regra = await regraComissao();
  const pg = [req.user.id];
  const contratos = (await pool.query(`${SELECT_C} WHERE p.usuario_id = $1 ${periodo(req, 'c.fechado_em', pg)} ORDER BY c.fechado_em DESC, c.id DESC`, pg)).rows
    .map((c) => comComissao(c, regra))
    .map((c) => ({ id: c.id, empresa: c.empresa, projeto: c.projeto, fechado_em: c.fechado_em, comissao: c.comissao, comissao_paga: c.comissao_paga }));
  const comissao = centavos(contratos.reduce((s, c) => s + c.comissao, 0));
  const pago = centavos(contratos.reduce((s, c) => s + (c.comissao_paga ? c.comissao : 0), 0));
  res.json({ contratos, totais: { contratos: contratos.length, comissao, pago, aPagar: centavos(comissao - pago) } });
}));

// ---------- detalhes de um funcionário (clique no painel) ----------
app.get('/api/painel/usuario/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = (await pool.query('SELECT id, nome, foto, papel, ativo, verificado FROM usuarios WHERE id = $1', [id])).rows[0];
  if (!u) return erro(res, 404, 'Funcionário não encontrado.');

  const p1 = [id];
  const numeros = (await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'aceitou')::int  AS aceitou,
           COUNT(*) FILTER (WHERE status = 'pensando')::int AS pensando,
           COUNT(*) FILTER (WHERE status = 'recusou')::int  AS recusou
      FROM prospeccoes p WHERE p.usuario_id = $1 ${periodo(req, 'p.criado_em', p1)}`, p1)).rows[0];

  const p2 = [id];
  const recentes = (await pool.query(`
    SELECT p.id, p.empresa, p.status, n.nome AS nicho, p.criado_em
      FROM prospeccoes p LEFT JOIN nichos n ON n.id = p.nicho_id
     WHERE p.usuario_id = $1 ${periodo(req, 'p.criado_em', p2)}
     ORDER BY p.criado_em DESC LIMIT 8`, p2)).rows;

  const resposta = { usuario: u, numeros, recentes };

  // dinheiro: só para ADM e gerente
  if (veTudo(req.user)) {
    const regra = await regraComissao();
    const p3 = [id];
    const contratos = (await pool.query(`${SELECT_C} WHERE p.usuario_id = $1 ${periodo(req, 'c.fechado_em', p3)} ORDER BY c.fechado_em DESC, c.id DESC`, p3)).rows
      .map((c) => comComissao(c, regra));
    resposta.financeiro = { regra, contratos, totais: somar(contratos) };
  }
  res.json(resposta);
}));

// ---------- financeiro (só ADM) ----------
const centavos = (n) => Math.round(n * 100) / 100;

// aceita 450 | "450" | "450,50" | "1.200,00"
function lerDinheiro(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 1e8 ? centavos(v) : NaN;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e8 ? centavos(n) : NaN;
}

async function regraComissao() {
  const { rows } = await pool.query(`SELECT valor FROM config WHERE chave = 'comissao'`);
  const v = rows[0]?.valor || {};
  return { fixa: Number(v.fixa) || 0, percentual: Number(v.percentual) || 0 };
}

// Comissão de um contrato:
// - fechado pelo próprio ADM → 0 (o dinheiro é todo dele)
// - valor manual definido → usa o manual
// - senão → fixo + porcentagem do valor (ex.: 40 + 20% de 450 = 130)
const calcAuto = (valor, regra) => centavos(regra.fixa + (Number(valor) * regra.percentual) / 100);

function comComissao(c, regra) {
  let comissao;
  let modo;
  if (c.usuario_papel === 'admin') { comissao = 0; modo = 'adm'; }
  else if (c.comissao_pct !== null && c.comissao_pct !== undefined) {
    comissao = centavos((Number(c.valor) * Number(c.comissao_pct)) / 100);
    modo = 'manual';
  }
  else if (c.comissao_manual !== null && c.comissao_manual !== undefined) { comissao = Number(c.comissao_manual); modo = 'manual'; }
  else {
    comissao = c.comissao_auto !== null && c.comissao_auto !== undefined
      ? Number(c.comissao_auto)
      : calcAuto(c.valor, regra);
    modo = 'auto';
  }
  return { ...c, comissao, modo, lucro: centavos(Number(c.valor) - comissao) };
}

function somar(lista) {
  const t = lista.reduce((a, c) => ({
    contratos: a.contratos + 1,
    vendido: a.vendido + c.valor,
    comissao: a.comissao + c.comissao,
    lucro: a.lucro + c.lucro,
    pago: a.pago + (c.comissao_paga ? c.comissao : 0),
  }), { contratos: 0, vendido: 0, comissao: 0, lucro: 0, pago: 0 });
  for (const k of ['vendido', 'comissao', 'lucro', 'pago']) t[k] = centavos(t[k]);
  t.aPagar = centavos(t.comissao - t.pago);
  t.ticket = t.contratos ? centavos(t.vendido / t.contratos) : 0;
  return t;
}

const SELECT_C = `
  SELECT c.id, c.prospeccao_id, c.projeto, c.valor::float8 AS valor,
         c.comissao_manual::float8 AS comissao_manual, c.comissao_auto::float8 AS comissao_auto,
         c.comissao_pct::float8 AS comissao_pct, c.comissao_paga,
         to_char(c.fechado_em, 'YYYY-MM-DD') AS fechado_em,
         p.empresa, p.status, n.nome AS nicho,
         u.id AS usuario_id, u.nome AS usuario_nome, u.papel AS usuario_papel
    FROM contratos c
    JOIN prospeccoes p ON p.id = c.prospeccao_id
    LEFT JOIN nichos n ON n.id = p.nicho_id
    JOIN usuarios u ON u.id = p.usuario_id`;

app.get('/api/financeiro', auth, soGestao, wrap(async (req, res) => {
  const regra = await regraComissao();
  const pc = [];
  const contratos = (await pool.query(`${SELECT_C} WHERE TRUE ${periodo(req, 'c.fechado_em', pc)} ORDER BY c.fechado_em DESC, c.id DESC`, pc)).rows
    .map((c) => comComissao(c, regra));

  // por funcionário
  const mapa = new Map();
  for (const c of contratos) {
    if (!mapa.has(c.usuario_id)) mapa.set(c.usuario_id, { id: c.usuario_id, nome: c.usuario_nome, papel: c.usuario_papel, lista: [] });
    mapa.get(c.usuario_id).lista.push(c);
  }
  const porFuncionario = [...mapa.values()]
    .map(({ lista, ...f }) => ({ ...f, ...somar(lista) }))
    .sort((a, b) => b.vendido - a.vendido);

  // por mês (meses seguidos, no máximo os últimos 12)
  const porMesMapa = new Map();
  for (const c of contratos) {
    const m = c.fechado_em.slice(0, 7);
    const x = porMesMapa.get(m) || { mes: m, vendido: 0, comissao: 0, lucro: 0 };
    x.vendido += c.valor; x.comissao += c.comissao; x.lucro += c.lucro;
    porMesMapa.set(m, x);
  }
  // meses seguidos: do início do filtro (ou do 1º contrato) até o fim do filtro (ou o mês atual)
  const porMes = [];
  if (porMesMapa.size) {
    const chaves = [...porMesMapa.keys()].sort();
    const hoje = new Date();
    const mesHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const inicio = dataOk(req.query.de) ? req.query.de.slice(0, 7) : chaves[0];
    let fim = dataOk(req.query.ate) ? req.query.ate.slice(0, 7) : mesHoje;
    if (fim > mesHoje) fim = mesHoje;
    if (chaves.at(-1) > fim) fim = chaves.at(-1);
    let [a, m] = (inicio < chaves[0] ? inicio : chaves[0]).split('-').map(Number);
    const [fimA, fimM] = fim.split('-').map(Number);
    while (a < fimA || (a === fimA && m <= fimM)) {
      const k = `${a}-${String(m).padStart(2, '0')}`;
      const x = porMesMapa.get(k) || { mes: k, vendido: 0, comissao: 0, lucro: 0 };
      porMes.push({ mes: k, vendido: centavos(x.vendido), comissao: centavos(x.comissao), lucro: centavos(x.lucro) });
      m += 1; if (m > 12) { m = 1; a += 1; }
    }
  }

  // aceitaram, mas ainda sem contrato registrado
  const pendentes = (await pool.query(`
    SELECT p.id, p.empresa, p.usuario_id, u.nome AS usuario_nome, n.nome AS nicho, p.atualizado_em
      FROM prospeccoes p
      JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN nichos n ON n.id = p.nicho_id
     WHERE p.status = 'aceitou'
       AND NOT EXISTS (SELECT 1 FROM contratos c WHERE c.prospeccao_id = p.id)
     ORDER BY p.atualizado_em DESC LIMIT 50`)).rows;

  res.json({ regra, totais: somar(contratos), contratos, porFuncionario, porMes, pendentes });
}));

app.get('/api/financeiro/regra', auth, soGestao, wrap(async (req, res) => {
  res.json(await regraComissao());
}));

app.get('/api/contratos/:id', auth, soGestao, wrap(async (req, res) => {
  const c = await contratoCompleto(Number(req.params.id));
  if (!c) return erro(res, 404, 'Contrato não encontrado.');
  res.json(c);
}));

app.put('/api/financeiro/regra', auth, precisa('regra', 'Você não tem permissão para mudar a regra de comissão.'), wrap(async (req, res) => {
  const fixa = lerDinheiro(req.body.fixa);
  const percentual = Number(String(req.body.percentual ?? '').replace(',', '.'));
  if (Number.isNaN(fixa)) return erro(res, 400, 'Valor fixo inválido.');
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return erro(res, 400, 'A porcentagem deve ficar entre 0 e 100.');
  const regra = { fixa, percentual: centavos(percentual) };
  const antes = await regraComissao();
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ('comissao', $1::jsonb)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [JSON.stringify(regra)]
  );
  if (antes.fixa !== regra.fixa || antes.percentual !== regra.percentual) {
    const r = (x) => `${reais(x.fixa)} + ${String(x.percentual).replace('.', ',')}%`;
    await registrar(req, 'contrato', 'regra', null, `mudou a regra de comissão de ${r(antes)} para ${r(regra)}`);
  }
  res.json(regra);
}));

function dadosContrato(b, atual = {}) {
  const valor = 'valor' in b ? lerDinheiro(b.valor) : atual.valor;
  if (Number.isNaN(valor) || valor === undefined) return { erro: 'Coloque o valor do projeto (ex.: 450,00).' };
  // comissão manual: "150,00" = valor em reais · "15%" = porcentagem do valor do projeto
  let manual = atual.comissao_manual ?? null;
  let pct = atual.comissao_pct ?? null;
  if ('comissao_manual' in b) {
    const bruto = b.comissao_manual === null ? '' : String(b.comissao_manual).trim();
    manual = null;
    pct = null;
    if (bruto.endsWith('%')) {
      const n = Number(bruto.slice(0, -1).trim().replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: 'A porcentagem da comissão deve ficar entre 0% e 100%.' };
      pct = centavos(n);
    } else if (bruto) {
      manual = lerDinheiro(bruto);
      if (Number.isNaN(manual)) return { erro: 'Valor da comissão inválido.' };
    }
  }
  const fechado = 'fechado_em' in b
    ? (/^\d{4}-\d{2}-\d{2}$/.test(b.fechado_em || '') ? b.fechado_em : null)
    : atual.fechado_em ?? null;
  return {
    projeto: 'projeto' in b ? txt(b.projeto, 200) : atual.projeto ?? null,
    valor,
    manual,
    pct,
    paga: 'comissao_paga' in b ? Boolean(b.comissao_paga) : Boolean(atual.comissao_paga),
    fechado,
  };
}

async function contratoCompleto(id) {
  const regra = await regraComissao();
  const c = (await pool.query(`${SELECT_C} WHERE c.id = $1`, [id])).rows[0];
  return c ? comComissao(c, regra) : null;
}

app.post('/api/contratos', auth, precisa('contratos', 'Você não tem permissão para registrar ou mudar contratos.'), wrap(async (req, res) => {
  const pid = Number(req.body.prospeccao_id);
  const existe = (await pool.query('SELECT id FROM prospeccoes WHERE id = $1', [pid])).rows[0];
  if (!existe) return erro(res, 404, 'Prospecção não encontrada.');
  const d = dadosContrato(req.body);
  if (d.erro) return erro(res, 400, d.erro);
  const auto = calcAuto(d.valor, await regraComissao());
  try {
    const { rows } = await pool.query(
      `INSERT INTO contratos (prospeccao_id, projeto, valor, comissao_manual, comissao_pct, comissao_auto, comissao_paga, fechado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE)) RETURNING id`,
      [pid, d.projeto, d.valor, d.manual, d.pct, auto, d.paga, d.fechado]
    );
    // contrato fechado = a empresa aceitou
    await pool.query(`UPDATE prospeccoes SET status = 'aceitou', retorno_em = NULL, atualizado_em = now() WHERE id = $1 AND status <> 'aceitou'`, [pid]);
    const c = await contratoCompleto(rows[0].id);
    await registrar(req, 'contrato', 'criou', c.id,
      `registrou contrato de ${c.empresa} (${c.usuario_nome}): ${reais(c.valor)}, comissão ${reais(c.comissao)}`);
    res.status(201).json(c);
  } catch (e) {
    if (e.code === '23505') return erro(res, 409, 'Essa empresa já tem um contrato registrado.');
    throw e;
  }
}));

app.put('/api/contratos/:id', auth, precisa('contratos', 'Você não tem permissão para registrar ou mudar contratos.'), wrap(async (req, res) => {
  const atual = await contratoCompleto(Number(req.params.id));
  if (!atual) return erro(res, 404, 'Contrato não encontrado.');
  const d = dadosContrato(req.body, atual);
  if (d.erro) return erro(res, 400, d.erro);
  // valor mudou (ou nunca foi calculado)? recalcula com a regra atual; senão mantém o do registro
  const auto = d.valor !== atual.valor || atual.comissao_auto === null
    ? calcAuto(d.valor, await regraComissao())
    : atual.comissao_auto;
  await pool.query(
    `UPDATE contratos SET projeto = $1, valor = $2, comissao_manual = $3, comissao_pct = $4, comissao_auto = $5,
            comissao_paga = $6, fechado_em = COALESCE($7::date, fechado_em) WHERE id = $8`,
    [d.projeto, d.valor, d.manual, d.pct, auto, d.paga, d.fechado, atual.id]
  );
  const c = await contratoCompleto(atual.id);
  const mud = [];
  if (c.valor !== atual.valor) mud.push(`valor ${reais(atual.valor)} → ${reais(c.valor)}`);
  if (c.comissao !== atual.comissao) mud.push(`comissão ${reais(atual.comissao)} → ${reais(c.comissao)}`);
  if (c.projeto !== atual.projeto) mud.push('projeto');
  if (c.fechado_em !== atual.fechado_em) mud.push(`data ${dataBR(atual.fechado_em)} → ${dataBR(c.fechado_em)}`);
  if (c.comissao_paga !== atual.comissao_paga) {
    mud.push(c.comissao_paga ? `marcou a comissão de ${reais(c.comissao)} como paga` : 'voltou a comissão para “a pagar”');
  }
  if (mud.length) {
    const soPaga = mud.length === 1 && c.comissao_paga !== atual.comissao_paga;
    await registrar(req, 'contrato', soPaga ? (c.comissao_paga ? 'pagou' : 'editou') : 'editou', c.id,
      `contrato de ${c.empresa} (${c.usuario_nome}): ${mud.join('; ')}`);
  }
  res.json(c);
}));

app.delete('/api/contratos/:id', auth, precisa('contratos', 'Você não tem permissão para registrar ou mudar contratos.'), wrap(async (req, res) => {
  const c = await contratoCompleto(Number(req.params.id));
  await pool.query('DELETE FROM contratos WHERE id = $1', [Number(req.params.id)]);
  if (c) await registrar(req, 'contrato', 'excluiu', c.id, `excluiu o contrato de ${c.empresa} (${c.usuario_nome}), que era de ${reais(c.valor)}`);
  res.json({ ok: true });
}));

// ---------- histórico (gestão vê) ----------
const TIPOS_HIST = ['prospeccao', 'contrato', 'equipe', 'sistema'];
app.get('/api/historico', auth, soGestao, wrap(async (req, res) => {
  const params = [];
  const cond = [];
  if (req.query.usuario) { params.push(Number(req.query.usuario)); cond.push(`h.usuario_id = $${params.length}`); }
  if (TIPOS_HIST.includes(req.query.tipo)) { params.push(req.query.tipo); cond.push(`h.tipo = $${params.length}`); }
  const q = txt(req.query.q, 100);
  if (q) { params.push('%' + q + '%'); cond.push(`(h.descricao ILIKE $${params.length} OR h.usuario_nome ILIKE $${params.length})`); }
  const per = periodo(req, 'h.criado_em', params);
  if (per) cond.push(per.replace(/^ AND /, ''));
  const { rows } = await pool.query(`
    SELECT h.id, h.usuario_id, COALESCE(u.nome, h.usuario_nome, 'Sistema') AS usuario_nome,
           h.tipo, h.acao, h.alvo_id, h.descricao, h.criado_em
      FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
     ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
     ORDER BY h.criado_em DESC, h.id DESC LIMIT 1000`, params);
  res.json(rows);
}));

// ---------- backup (só o ADM) ----------
// Baixa tudo num arquivo .json e permite restaurar depois.
// A ordem importa: quem depende de outra tabela vem depois dela.
const TABELAS_BACKUP = ['usuarios', 'nichos', 'problemas', 'prospeccoes', 'prospeccao_problemas', 'contratos', 'config', 'historico'];

app.get('/api/backup', auth, soAdmin, wrap(async (req, res) => {
  const tabelas = {};
  for (const t of TABELAS_BACKUP) {
    // o próprio Postgres transforma cada linha em JSON (datas, números e textos ficam exatos)
    const { rows } = await pool.query(`SELECT COALESCE(json_agg(t), '[]'::json) AS dados FROM ${t} t`);
    tabelas[t] = rows[0].dados;
  }
  const agora = new Date().toISOString();
  await registrar(req, 'sistema', 'backup', null, 'baixou um backup completo');
  // data no horário do Brasil (às 23h ainda é "hoje", não amanhã)
  let dia = agora.slice(0, 10);
  try { dia = new Date().toLocaleDateString('sv-SE', { timeZone: process.env.FUSO_HORARIO || 'America/Recife' }); } catch { /* fuso inválido: fica UTC */ }
  res.setHeader('Content-Disposition', `attachment; filename="prospecta-backup-${dia}.json"`);
  res.json({ app: 'prospecta', versao: 1, gerado_em: agora, tabelas });
}));

app.post('/api/backup/restaurar', auth, soAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.app !== 'prospecta' || b.versao !== 1 || typeof b.tabelas !== 'object' || !b.tabelas) {
    return erro(res, 400, 'Esse arquivo não é um backup do sistema.');
  }
  for (const t of TABELAS_BACKUP) {
    if (b.tabelas[t] !== undefined && !Array.isArray(b.tabelas[t])) return erro(res, 400, `Backup com defeito (${t}).`);
  }
  const usuarios = b.tabelas.usuarios || [];
  if (!usuarios.some((u) => u.papel === 'admin' && u.ativo !== false)) {
    return erro(res, 400, 'O backup precisa ter pelo menos um administrador ativo.');
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`TRUNCATE ${TABELAS_BACKUP.join(', ')} RESTART IDENTITY CASCADE`);
    for (const t of TABELAS_BACKUP) {
      const linhas = b.tabelas[t] || [];
      if (!linhas.length) continue;
      // só as colunas que existem nas duas pontas (backup antigo continua funcionando)
      const { rows: cols } = await cliente.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [t]);
      const existentes = new Set(cols.map((c) => c.column_name));
      const usar = Object.keys(linhas[0]).filter((c) => existentes.has(c));
      const lista = usar.map((c) => `"${c}"`).join(', ');
      await cliente.query(
        `INSERT INTO ${t} (${lista}) SELECT ${lista} FROM json_populate_recordset(NULL::${t}, $1::json)`,
        [JSON.stringify(linhas)]
      );
    }
    // os próximos ids continuam depois do maior que voltou
    for (const t of TABELAS_BACKUP) {
      if (t === 'prospeccao_problemas' || t === 'config') continue;
      await cliente.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
    }
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error('Falha ao restaurar backup:', e);
    return erro(res, 400, 'Não consegui restaurar esse backup. Nada foi alterado.');
  } finally {
    cliente.release();
  }
  const quando = typeof b.gerado_em === 'string' ? new Date(b.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Recife' }) : '?';
  const aindaExiste = (await pool.query('SELECT 1 FROM usuarios WHERE id = $1 AND ativo', [req.user.id])).rows.length > 0;
  await registrar(aindaExiste ? req : {}, 'sistema', 'restaurou', null, `restaurou o backup de ${quando}`);
  res.json({ ok: true, sair: !aindaExiste });
}));

// ---------- erros ----------
app.use('/api', (req, res) => erro(res, 404, 'Rota não encontrada.'));
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return erro(res, 413, 'Arquivo grande demais.');
  console.error(err);
  erro(res, 500, 'Erro interno. Tente de novo.');
});

init()
  .then(() => app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`)))
  .catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
