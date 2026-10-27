// =====================================================
//  Prospecta — front-end (JavaScript puro, sem framework)
// =====================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS = { aceitou: 'Aceitou', pensando: 'Pensando', recusou: 'Recusou' };
const estado = { eu: null, equipe: [], nichos: [], prosp: [], dias: '30' };

// ---------- comunicação com o servidor ----------
async function api(url, { method = 'GET', body } = {}) {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let dados = null;
  try { dados = await r.json(); } catch { /* sem corpo */ }
  if (r.status === 401 && url !== '/api/login') {
    mostrarLogin();
  }
  if (!r.ok) throw Object.assign(new Error(dados?.erro || 'Algo deu errado.'), { status: r.status });
  return dados;
}

function toast(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast mostrar ${tipo}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2800);
}

// ---------- ajudantes de exibição ----------
const CORES = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#7c3aed', '#059669', '#e11d48'];

function avatar(u, tam = 32) {
  if (u?.foto) return `<img class="avatar" style="--t:${tam}px" src="${esc(u.foto)}" alt="">`;
  const ini = (u?.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const cor = CORES[(u?.id || 0) % CORES.length];
  return `<span class="avatar ini" style="--t:${tam}px;--c:${cor}">${esc(ini)}</span>`;
}

// ---------- cargos ----------
// admin = dono · gerente = sub-dono (vê tudo, altera só o que o dono liberar) · funcionario
const ehAdmin = () => estado.eu?.papel === 'admin';
const veTudo = () => ehAdmin() || estado.eu?.papel === 'gerente';
const pode = (perm) => ehAdmin() || (estado.eu?.papel === 'gerente' && Boolean(estado.eu.permissoes?.[perm]));
const NOME_CARGO = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário' };
// selo azul de verificado (só o dono concede)
const SELO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sv-f" d="M12 1.8l2.4 1.8 3-.2 1 2.8 2.6 1.6-.8 2.9 1.2 2.7-2.2 2 .1 3-2.9.7-1.5 2.6-2.9-.9L12 22.2l-2.4-1.8-2.9.9-1.5-2.6-2.9-.7.1-3-2.2-2 1.2-2.7-.8-2.9 2.6-1.6 1-2.8 3 .2z"/><path class="sv-c" d="M7.8 12.3l2.8 2.8 5.6-5.8"/></svg>';
const selo = (u) => (u?.verificado ? `<span class="verif" title="Verificado" aria-label="Verificado" role="img">${SELO_SVG}</span>` : '');
const seloDe = (id) => selo(id === estado.eu?.id ? estado.eu : estado.equipe?.find((m) => m.id === id));
const rotLucro = () => (ehAdmin() ? 'Seu lucro' : 'Lucro da empresa');
const quemFechou = (c, capital) => (c.usuario_id === estado.eu.id ? (capital ? 'Você' : 'você') : c.usuario_nome);

const membro = (id, nome) => estado.equipe.find((m) => m.id === id) || { id, nome: nome || 'Ex-funcionário' };
const primeiroNome = (n) => (n || '').split(' ')[0];

function dataCurta(d) {
  const dt = new Date(d);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 864e5);
  if (dt.toDateString() === hoje.toDateString()) return 'Hoje';
  if (dt.toDateString() === ontem.toDateString()) return 'Ontem';
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}
const dataLonga = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function linkSeguro(v) {
  if (!v) return null;
  let u = v.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    return ['http:', 'https:'].includes(x.protocol) && x.hostname.includes('.') ? x.href : null;
  } catch { return null; }
}
function linkInsta(v) {
  if (!v) return null;
  const s = v.trim();
  if (/^@?[\w.]+$/.test(s) && !s.includes('instagram.com')) return 'https://instagram.com/' + encodeURIComponent(s.replace(/^@/, ''));
  return linkSeguro(s);
}
function linkWhats(tel) {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return 'https://wa.me/' + (d.length <= 11 ? '55' + d : d);
}
// ---------- dinheiro ----------
const centavos = (n) => Math.round(n * 100) / 100;
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = (n) => (n >= 1000
  ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  : 'R$ ' + Math.round(n).toLocaleString('pt-BR'));
const fmtValor = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
// aceita "450", "450,50", "1.200,00", "R$ 900" → número | null (vazio) | NaN (inválido)
function lerValor(s) {
  let t = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? centavos(n) : NaN;
}
const comissaoAuto = (valor, r) => centavos(r.fixa + (valor * r.percentual) / 100);
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (chave) => { const [a, m] = chave.split('-'); return `${MESES[Number(m) - 1]}/${a.slice(2)}`; };
const dataBr = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const lerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

// ---------- dica flutuante: passe o mouse em qualquer elemento com data-tip ----------
// tip('<b>texto</b>') monta o atributo; o conteúdo já deve vir com esc() nos dados do usuário
const tip = (html) => `data-tip="${esc(html)}"`;
const dicaEl = document.createElement('div');
dicaEl.className = 'dica-flutuante';
dicaEl.hidden = true;
document.body.append(dicaEl);
function posicionarDica(x, y) {
  const r = dicaEl.getBoundingClientRect();
  let left = x + 14;
  let top = y + 16;
  if (left + r.width > innerWidth - 8) left = Math.max(8, x - r.width - 14);
  if (top + r.height > innerHeight - 8) top = Math.max(8, y - r.height - 12);
  dicaEl.style.left = left + 'px';
  dicaEl.style.top = top + 'px';
}
document.addEventListener('pointerover', (e) => {
  const a = e.target.closest?.('[data-tip]');
  if (!a) return;
  dicaEl.innerHTML = a.dataset.tip;
  dicaEl.hidden = false;
  posicionarDica(e.clientX, e.clientY);
});
document.addEventListener('pointermove', (e) => {
  if (!dicaEl.hidden && e.target.closest?.('[data-tip]')) posicionarDica(e.clientX, e.clientY);
});
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch') return; // no celular a dica fica até tocar em outro lugar
  const a = e.target.closest?.('[data-tip]');
  if (a && !a.contains(e.relatedTarget)) dicaEl.hidden = true;
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('[data-tip]')) dicaEl.hidden = true; });
document.addEventListener('scroll', () => (dicaEl.hidden = true), true);

// ---------- filtro de período: ano + mês, ou datas personalizadas ----------
function criarFiltro(el, chave, aoMudar) {
  const anoAtual = String(new Date().getFullYear());
  let f = lerLocal('periodo-' + chave) || { ano: anoAtual, mes: 0, modo: 'mes', de: '', ate: '' };
  let abrirDatas = f.modo === 'pers';

  function intervalo() {
    if (f.modo === 'pers') return { de: f.de || '', ate: f.ate || '' };
    if (f.ano === 'todos') return { de: '', ate: '' };
    if (!f.mes) return { de: `${f.ano}-01-01`, ate: `${f.ano}-12-31` };
    const mm = String(f.mes).padStart(2, '0');
    const ultimo = new Date(Number(f.ano), f.mes, 0).getDate();
    return { de: `${f.ano}-${mm}-01`, ate: `${f.ano}-${mm}-${ultimo}` };
  }
  function rotulo() {
    if (f.modo === 'pers') {
      if (f.de && f.ate) return `de ${dataBr(f.de)} a ${dataBr(f.ate)}`;
      if (f.de) return `desde ${dataBr(f.de)}`;
      if (f.ate) return `até ${dataBr(f.ate)}`;
      return 'todo o período';
    }
    if (f.ano === 'todos') return 'todo o período';
    if (!f.mes) return `ano de ${f.ano}`;
    return `${MESES_LONGO[f.mes - 1]} de ${f.ano}`;
  }
  const query = () => {
    const { de, ate } = intervalo();
    const p = new URLSearchParams();
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    return p.toString();
  };
  function mudou() {
    gravarLocal('periodo-' + chave, f);
    desenhar();
    aoMudar();
  }
  function desenhar() {
    const anos = [...new Set([...(estado.anos || []).map(String), anoAtual, f.ano !== 'todos' ? f.ano : anoAtual])].sort().reverse();
    el.innerHTML = `
      <div class="fp-linha">
        <select class="fp-ano" aria-label="Ano">
          <option value="todos">Todos os anos</option>
          ${anos.map((a) => `<option value="${a}">${a}</option>`).join('')}
        </select>
        <div class="fp-meses" role="group" aria-label="Mês">
          <button type="button" data-mes="0">Ano todo</button>
          ${MESES.map((m, i) => `<button type="button" data-mes="${i + 1}" title="${MESES_LONGO[i]}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
        </div>
        <button type="button" class="fp-pers" aria-expanded="${abrirDatas}">Personalizado</button>
      </div>
      <div class="fp-datas" ${abrirDatas ? '' : 'hidden'}>
        <label>De<input type="date" class="fp-de" value="${f.de || ''}"></label>
        <label>Até<input type="date" class="fp-ate" value="${f.ate || ''}"></label>
        <button type="button" class="btn pequeno primario fp-aplicar">Aplicar</button>
        ${f.modo === 'pers' ? '<button type="button" class="btn pequeno fantasma fp-limpar">Voltar para ano/mês</button>' : ''}
      </div>`;
    el.querySelector('.fp-ano').value = f.modo === 'pers' ? f.ano : f.ano;
    const semMes = f.ano === 'todos' || f.modo === 'pers';
    el.querySelectorAll('[data-mes]').forEach((b) => {
      b.disabled = semMes;
      b.classList.toggle('ativo', !semMes && Number(b.dataset.mes) === f.mes);
    });
    el.querySelector('.fp-pers').classList.toggle('ativo', f.modo === 'pers');
    // deixa o mês escolhido visível na faixa que rola
    el.querySelector('[data-mes].ativo')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  el.addEventListener('change', (e) => {
    if (!e.target.matches('.fp-ano')) return;
    f = { ...f, ano: e.target.value, mes: 0, modo: 'mes' };
    abrirDatas = false;
    mudou();
  });
  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mes]');
    if (m && !m.disabled) { f = { ...f, mes: Number(m.dataset.mes), modo: 'mes' }; mudou(); return; }
    if (e.target.closest('.fp-pers')) { abrirDatas = !abrirDatas; desenhar(); if (abrirDatas) el.querySelector('.fp-de').focus(); return; }
    if (e.target.closest('.fp-limpar')) { f = { ...f, modo: 'mes' }; abrirDatas = false; mudou(); return; }
    if (e.target.closest('.fp-aplicar')) {
      const de = el.querySelector('.fp-de').value;
      const ate = el.querySelector('.fp-ate').value;
      if (de && ate && de > ate) return toast('A data inicial precisa ser antes da final.', 'erro');
      f = { ...f, modo: 'pers', de, ate };
      mudou();
    }
  });
  return {
    query, rotulo, intervalo, desenhar,
    get estado() { return f; },
    irPara(ano, mes) { f = { ...f, ano: String(ano), mes, modo: 'mes' }; abrirDatas = false; mudou(); },
    // copia o período de outra tela, sem recarregar
    definir(outro) { f = { ...outro }; abrirDatas = f.modo === 'pers'; gravarLocal('periodo-' + chave, f); },
  };
}

// cores dos gráficos: cada pessoa tem sempre a mesma cor
// mesma cor do círculo com as iniciais (avatar), para reconhecer a pessoa no gráfico
const corPessoa = (id) => CORES[id % CORES.length];
// marcas "redondas" para o eixo: 0, 500, 1000, 1500...
function escalaBonita(max, partes = 4) {
  if (max <= 0) return { topo: partes, passo: 1 };
  const bruto = max / partes;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= bruto);
  return { topo: passo * partes, passo };
}

const linkMapa = (l) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(l);

function campoLink(texto, href) {
  return href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(texto)} ↗</a>`
    : `<span>${esc(texto)}</span>`;
}

// =====================================================
//  LOGIN
// =====================================================
function mostrarLogin() {
  $('#tela-app').hidden = true;
  $('#tela-login').hidden = false;
  $$('dialog[open]').forEach((d) => d.close());
  setTimeout(() => $('#form-login [name=login]').focus(), 50);
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = $('button', f);
  $('#login-erro').textContent = '';
  btn.disabled = true;
  try {
    estado.eu = await api('/api/login', { method: 'POST', body: { login: f.login.value, senha: f.senha.value } });
    f.reset();
    await entrarApp();
  } catch (err) {
    $('#login-erro').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

async function entrarApp() {
  $('#tela-login').hidden = true;
  $('#tela-app').hidden = false;
  aplicarCargo();
  renderEu();
  await carregarBase();
  rotear();
}

// mostra/esconde o que depende do cargo e das permissões
function aplicarCargo() {
  $$('.so-admin').forEach((el) => (el.hidden = !ehAdmin()));
  $$('.so-gestao').forEach((el) => (el.hidden = !veTudo()));
  $$('.so-func').forEach((el) => (el.hidden = ehAdmin()));
  $$('[data-perm]').forEach((el) => (el.hidden = !pode(el.dataset.perm)));
  // formulários que o gerente só vê: ficam travados
  $$('[data-perm-form]').forEach((f) => {
    const ok = pode(f.dataset.permForm);
    $$('input, select, textarea, button', f).forEach((c) => (c.disabled = !ok));
    f.classList.toggle('so-leitura', !ok);
  });
  document.body.dataset.cargo = estado.eu.papel;
  $$('.rot-lucro').forEach((el) => (el.textContent = rotLucro()));
  const dFin = $('#fin-dica');
  if (dFin) dFin.textContent = ehAdmin()
    ? 'Só a gestão vê esta tela. Contratos fechados, quanto você recebe e a comissão de cada pessoa.'
    : `Você vê tudo como gerente. Pode alterar: ${listaPerms(estado.eu.permissoes)}.`;
  const dEq = $('#eq-dica');
  if (dEq) dEq.textContent = ehAdmin()
    ? 'Só a gestão vê esta tela. Crie logins, defina cargos e dê o selo de verificado.'
    : pode('equipe') ? 'Você pode criar e editar funcionários. Cargos e selo, só o administrador.' : 'Você vê a equipe, mas só o administrador pode mudar.';
}

function renderEu() {
  $('#eu').innerHTML = `${avatar(estado.eu, 34)}<span>${esc(primeiroNome(estado.eu.nome))}${selo(estado.eu)}</span>`;
}

async function carregarBase() {
  [estado.equipe, estado.nichos, estado.anos, estado.problemas] = await Promise.all([
    api('/api/equipe'), api('/api/nichos'), api('/api/anos'), api('/api/problemas'),
  ]);
  preencherFiltros();
}

function preencherFiltros() {
  const fn = $('#f-nicho');
  const vn = fn.value;
  fn.innerHTML = '<option value="">Todos os nichos</option>' +
    estado.nichos.map((n) => `<option value="${n.id}">${esc(n.nome)}</option>`).join('') +
    '<option value="sem">Sem nicho</option>';
  fn.value = vn;

  const fu = $('#f-usuario');
  const vu = fu.value;
  fu.innerHTML = '<option value="">Todo mundo</option>' +
    `<option value="${estado.eu.id}">Só as minhas</option>` +
    estado.equipe.filter((m) => m.id !== estado.eu.id).map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  fu.value = vu;

  $('#lista-nichos').innerHTML = estado.nichos.map((n) => `<option value="${esc(n.nome)}"></option>`).join('');
}

// leva para Prospecções já filtrado por um nicho, com o período da tela de onde veio
function irParaNicho(nichoId, filtroOrigem) {
  filtroProsp.definir(filtroOrigem.estado);
  $('#f-busca').value = '';
  $('#f-status').value = '';
  $('#f-usuario').value = '';
  $('#f-nicho').value = nichoId ? String(nichoId) : 'sem';
  dicaEl.hidden = true;
  if (location.hash === '#prospeccoes') carregarProsp().catch((err) => toast(err.message, 'erro'));
  else location.hash = '#prospeccoes';
  scrollTo({ top: 0 });
}

// =====================================================
//  NAVEGAÇÃO
// =====================================================
function rotear() {
  if (!estado.eu) return;
  let v = location.hash.slice(1) || 'prospeccoes';
  if (!['prospeccoes', 'painel', 'nichos', 'observacoes', 'ganhos', 'equipe', 'financeiro', 'perfil'].includes(v)) v = 'prospeccoes';
  if ((v === 'equipe' || v === 'financeiro') && !veTudo()) v = 'prospeccoes';
  if (v === 'ganhos' && estado.eu.papel === 'admin') v = 'financeiro';

  $$('.view').forEach((s) => s.classList.toggle('ativa', s.id === 'view-' + v));
  $$('.abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.view === v));

  ({ prospeccoes: carregarProsp, painel: carregarPainel, nichos: carregarNichos, observacoes: carregarObs, ganhos: carregarGanhos, equipe: carregarUsuarios, financeiro: carregarFinanceiro, perfil: renderPerfil })[v]()
    .catch?.((e) => toast(e.message, 'erro'));
}
window.addEventListener('hashchange', rotear);

// Fechar diálogos: botão "×", "Cancelar" ou clique fora
$$('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-fechar]')) d.close();
  });
});

// =====================================================
//  PROSPECÇÕES
// =====================================================
const filtroProsp = criarFiltro($('#fp-prosp'), 'prospeccoes', () => carregarProsp().catch((err) => toast(err.message, 'erro')));

async function carregarProsp() {
  filtroProsp.desenhar();
  const p = new URLSearchParams(filtroProsp.query());
  const q = $('#f-busca').value.trim();
  if (q) p.set('q', q);
  if ($('#f-status').value) p.set('status', $('#f-status').value);
  if ($('#f-nicho').value) p.set('nicho', $('#f-nicho').value);
  if ($('#f-usuario').value) p.set('usuario', $('#f-usuario').value);
  estado.prosp = await api('/api/prospeccoes?' + p);
  renderLista();
}

function renderLista() {
  const el = $('#lista-prosp');
  const n = estado.prosp.length;
  const filtrando = $('#f-busca').value || $('#f-status').value || $('#f-nicho').value || $('#f-usuario').value;
  $('#contagem').textContent = `${n === 1 ? '1 empresa' : `${n} empresas`} · ${filtroProsp.rotulo()}`;

  if (!n) {
    el.innerHTML = filtrando
      ? `<div class="vazio"><strong>Nada encontrado</strong>Tente mudar a busca ou os filtros.</div>`
      : `<div class="vazio"><strong>Nenhuma prospecção ainda</strong>Clique em “+ Nova prospecção” para registrar a primeira empresa.</div>`;
    return;
  }

  el.innerHTML = estado.prosp.map((p) => {
    const m = membro(p.usuario_id, p.usuario_nome);
    return `
      <button class="item" data-id="${p.id}">
        <div class="item-princ">
          <strong>${esc(p.empresa)}</strong>
          <span class="sub">
            ${p.nicho ? `<span class="tag">${esc(p.nicho)}</span>` : ''}
            ${p.telefone ? `<span>${esc(p.telefone)}</span>` : ''}
          </span>
        </div>
        <span class="chip ${p.status}">${STATUS[p.status]}</span>
        <span class="quem">${avatar(m, 26)}<span>${esc(p.usuario_id === estado.eu.id ? 'Você' : primeiroNome(m.nome))}</span></span>
        <time datetime="${esc(p.criado_em)}">${dataCurta(p.criado_em)}</time>
      </button>`;
  }).join('');
}

$('#lista-prosp').addEventListener('click', (e) => {
  const b = e.target.closest('.item');
  if (b) abrirDetalhe(Number(b.dataset.id));
});

let tBusca;
$('#f-busca').addEventListener('input', () => {
  clearTimeout(tBusca);
  tBusca = setTimeout(() => carregarProsp().catch((e) => toast(e.message, 'erro')), 250);
});
['#f-status', '#f-nicho', '#f-usuario'].forEach((s) =>
  $(s).addEventListener('change', () => carregarProsp().catch((e) => toast(e.message, 'erro')))
);

// ---------- detalhes ----------
const podeEditar = (p) => pode('prospeccoes') || p.usuario_id === estado.eu.id;

function abrirDetalhe(id) {
  const p = estado.prosp.find((x) => x.id === id) || (estado.obs?.itens || []).find((x) => x.id === id);
  if (!p) return;
  const m = membro(p.usuario_id, p.usuario_nome);
  const pode = podeEditar(p);
  const vazio = '<span class="vazio-campo">—</span>';

  const zap = linkWhats(p.telefone);
  const outras = (p.outras_redes || '').split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => campoLink(s, linkSeguro(s))).join('');

  $('#detalhe').innerHTML = `
    <div class="dlg-cab">
      <div>
        <h3>${esc(p.empresa)}</h3>
        <div class="det-titulo">
          ${p.nicho ? `<span class="tag">${esc(p.nicho)}</span>` : ''}
          ${pode ? '' : `<span class="chip ${p.status}">${STATUS[p.status]}</span>`}
        </div>
      </div>
      <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
    </div>

    ${pode ? `
      <div class="rotulo">Resultado</div>
      <div class="status-escolha status-rapido">
        ${Object.entries(STATUS).map(([k, v]) => `
          <label class="op ${k}"><input type="radio" name="st-rapido" value="${k}" ${p.status === k ? 'checked' : ''}><span>${v}</span></label>
        `).join('')}
      </div>` : ''}

    <dl class="det-grade">
      <div class="det-linha"><dt>Número</dt><dd>
        ${p.telefone ? `<span>${esc(p.telefone)}</span>${zap ? `<a class="zap" href="${esc(zap)}" target="_blank" rel="noopener noreferrer">Abrir no WhatsApp ↗</a>` : ''}` : vazio}
      </dd></div>
      <div class="det-linha"><dt>Localidade</dt><dd>${p.localidade ? campoLink(p.localidade, linkMapa(p.localidade)) : vazio}</dd></div>
      <div class="det-linha"><dt>Instagram</dt><dd>${p.instagram ? campoLink(p.instagram, linkInsta(p.instagram)) : vazio}</dd></div>
      <div class="det-linha"><dt>Site</dt><dd>${p.site ? campoLink(p.site, linkSeguro(p.site)) : vazio}</dd></div>
      <div class="det-linha"><dt>Outras redes</dt><dd>${outras || vazio}</dd></div>
      <div class="det-linha"><dt>Problemas</dt><dd>${(p.problemas || []).length
        ? `<span class="chips-prob">${p.problemas.map((x) => `<span class="prob-chip">${esc(x)}</span>`).join('')}</span>` : vazio}</dd></div>
    </dl>

    <div class="rotulo">Anotações</div>
    <p class="anotacoes">${p.anotacoes ? esc(p.anotacoes) : '<span class="vazio-campo">Sem anotações.</span>'}</p>

    ${veTudo() && (p.contrato_id || (p.status === 'aceitou' && pode('contratos'))) ? `
      <div class="contrato-linha">
        ${p.contrato_id
          ? `<span>Contrato fechado: <b class="dinheiro">${brl(p.contrato_valor)}</b></span><button type="button" class="btn pequeno" id="det-contrato">Ver contrato</button>`
          : `<span>Aceitou e ainda não tem contrato.</span><button type="button" class="btn pequeno primario" id="det-contrato">Registrar contrato</button>`}
      </div>` : ''}

    <div class="por">${avatar(m, 30)}<span>Prospectado por <b>${esc(m.nome)}</b>${selo(m)} em ${dataLonga(p.criado_em)}</span></div>

    ${pode ? `
      <div class="dlg-rodape">
        <button type="button" class="btn fantasma perigo" id="det-excluir">Excluir</button>
        <button type="button" class="btn primario" id="det-editar">Editar</button>
      </div>` : ''}
  `;

  if (pode) {
    $$('[name=st-rapido]', $('#detalhe')).forEach((r) => r.addEventListener('change', async () => {
      try {
        const nova = await api(`/api/prospeccoes/${p.id}`, { method: 'PUT', body: { status: r.value } });
        Object.assign(p, nova);
        renderLista();
        toast(`Marcado como “${STATUS[r.value]}”`);
        if (veTudo()) abrirDetalhe(p.id); // mostra/esconde o botão de contrato
      } catch (err) { toast(err.message, 'erro'); }
    }));
    $('#det-editar').onclick = () => { $('#dlg-detalhe').close(); abrirFormProsp(p); };
    $('#det-excluir').onclick = async () => {
      if (!confirm(`Excluir a prospecção de “${p.empresa}”? Isso não pode ser desfeito.`)) return;
      try {
        await api(`/api/prospeccoes/${p.id}`, { method: 'DELETE' });
        $('#dlg-detalhe').close();
        toast('Prospecção excluída');
        carregarProsp();
      } catch (err) { toast(err.message, 'erro'); }
    };
  }
  $('#det-contrato')?.addEventListener('click', () => {
    $('#dlg-detalhe').close();
    abrirContrato({
      prospeccao_id: p.id, contrato_id: p.contrato_id, empresa: p.empresa,
      usuario_nome: m.nome, usuario_papel: m.papel,
    });
  });
  if (!$('#dlg-detalhe').open) $('#dlg-detalhe').showModal();
}

// ---------- criar / editar ----------
let editandoProsp = null;

function abrirFormProsp(p = null) {
  editandoProsp = p;
  const f = $('#form-prosp');
  f.reset();
  $('#prosp-erro').textContent = '';
  $('#dlg-prosp-titulo').textContent = p ? 'Editar prospecção' : 'Nova prospecção';
  if (p) {
    for (const c of ['empresa', 'nicho', 'telefone', 'localidade', 'instagram', 'site', 'outras_redes', 'anotacoes']) {
      f[c].value = p[c] || '';
    }
    f.querySelector(`[name=status][value=${p.status}]`).checked = true;
  }
  $('#mais-info').open = Boolean(p && (p.localidade || p.instagram || p.site || p.outras_redes));
  fecharCombo();
  tagsProb.definir(p ? p.problemas || [] : []);
  $('#dlg-prosp').showModal();
  setTimeout(() => f.empresa.focus(), 50);
}

$('#btn-nova').addEventListener('click', () => abrirFormProsp());

// ---------- campo de nicho: lista que filtra enquanto digita ----------
const combo = { caixa: $('#combo-nicho'), input: $('#in-nicho'), lista: $('#combo-lista'), itens: [], ativo: -1 };
const semAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function destacar(nome, q) {
  const i = q ? semAcento(nome).indexOf(semAcento(q)) : -1;
  // só destaca quando as posições batem (nomes sem letras compostas)
  if (i < 0 || semAcento(nome).length !== nome.length) return esc(nome);
  return esc(nome.slice(0, i)) + '<mark>' + esc(nome.slice(i, i + q.trim().length)) + '</mark>' + esc(nome.slice(i + q.trim().length));
}

function renderCombo() {
  const q = combo.input.value.trim();
  const nq = semAcento(q);
  const achados = estado.nichos
    .filter((n) => semAcento(n.nome).includes(nq))
    .sort((a, b) =>
      semAcento(b.nome).startsWith(nq) - semAcento(a.nome).startsWith(nq) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const existe = estado.nichos.some((n) => semAcento(n.nome) === nq);

  combo.itens = achados.map((n) => ({ tipo: 'nicho', nome: n.nome, total: n.total }));
  if (q && !existe) combo.itens.push({ tipo: 'novo', nome: q });
  if (combo.ativo >= combo.itens.length) combo.ativo = combo.itens.length - 1;

  if (!combo.itens.length) {
    combo.lista.innerHTML = '<li class="combo-vazio">Nenhum nicho ainda. Digite o nome para criar o primeiro.</li>';
    return;
  }
  combo.lista.innerHTML = combo.itens.map((it, i) => it.tipo === 'novo'
    ? `<li role="option" data-i="${i}" class="combo-op novo ${i === combo.ativo ? 'ativo' : ''}"><span class="mais">+</span><span>Criar nicho “${esc(it.nome)}”</span></li>`
    : `<li role="option" data-i="${i}" class="combo-op ${i === combo.ativo ? 'ativo' : ''}"><span>${destacar(it.nome, q)}</span><span class="combo-qtd">${it.total}</span></li>`
  ).join('');
  combo.lista.querySelector('.ativo')?.scrollIntoView({ block: 'nearest' });
}

function abrirCombo() {
  renderCombo();
  combo.lista.hidden = false;
  combo.caixa.classList.add('aberto');
  combo.input.setAttribute('aria-expanded', 'true');
}
function fecharCombo() {
  combo.lista.hidden = true;
  combo.caixa.classList.remove('aberto');
  combo.input.setAttribute('aria-expanded', 'false');
  combo.ativo = -1;
}
function escolherCombo(i) {
  const it = combo.itens[i];
  if (!it) return;
  combo.input.value = it.nome;
  fecharCombo();
}

combo.input.addEventListener('focus', abrirCombo);
combo.input.addEventListener('click', () => { if (combo.lista.hidden) abrirCombo(); });
combo.input.addEventListener('input', () => {
  combo.ativo = combo.input.value.trim() ? 0 : -1;
  abrirCombo();
});
combo.input.addEventListener('blur', () => setTimeout(fecharCombo, 120));
combo.input.addEventListener('keydown', (e) => {
  const aberto = !combo.lista.hidden;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!aberto) return abrirCombo();
    const n = combo.itens.length;
    if (!n) return;
    combo.ativo = e.key === 'ArrowDown' ? (combo.ativo + 1) % n : (combo.ativo - 1 + n) % n;
    renderCombo();
  } else if (e.key === 'Enter' && aberto) {
    e.preventDefault(); // não envia o formulário, só escolhe
    if (combo.ativo >= 0) escolherCombo(combo.ativo); else fecharCombo();
  } else if (e.key === 'Escape' && aberto) {
    e.preventDefault(); // fecha só a lista, não o formulário
    e.stopPropagation();
    combo.segurarEsc = true;
    setTimeout(() => (combo.segurarEsc = false), 0);
    fecharCombo();
  } else if (e.key === 'Tab' && aberto && combo.ativo >= 0) {
    escolherCombo(combo.ativo);
  }
});
// o navegador fecha o formulário no Esc; se o Esc era para a lista, impede
$('#dlg-prosp').addEventListener('cancel', (e) => {
  if (combo.segurarEsc) e.preventDefault();
});
combo.lista.addEventListener('mousedown', (e) => {
  e.preventDefault(); // mantém o foco no campo
  const li = e.target.closest('[data-i]');
  if (li) escolherCombo(Number(li.dataset.i));
});
$('.combo-seta').addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (combo.lista.hidden) { combo.input.focus(); abrirCombo(); } else fecharCombo();
});

$('#form-prosp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('.btn.primario');
  const dados = Object.fromEntries(new FormData(f));
  tagsProb.confirmarDigitado(); // texto digitado sem Enter também vale
  dados.problemas = tagsProb.valores();
  btn.disabled = true;
  try {
    if (editandoProsp) {
      await api(`/api/prospeccoes/${editandoProsp.id}`, { method: 'PUT', body: dados });
      toast('Alterações salvas');
    } else {
      await api('/api/prospeccoes', { method: 'POST', body: dados });
      toast('Prospecção registrada!');
    }
    $('#dlg-prosp').close();
    // pode ter nascido um nicho ou problema novo
    [estado.nichos, estado.problemas] = await Promise.all([api('/api/nichos'), api('/api/problemas')]);
    preencherFiltros();
    atualizarTelaAtual();
  } catch (err) {
    $('#prosp-erro').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- campo "Problemas da empresa": várias etiquetas ----------
const tagsProb = (() => {
  const caixa = $('#tags-prob');
  const input = $('#in-prob');
  const lista = $('#prob-lista');
  let sel = [];
  let itens = [];
  let ativo = -1;
  const mesmo = (a, b) => semAcento(a) === semAcento(b);

  function desenharChips() {
    $('#prob-chips').innerHTML = sel.map((n, i) =>
      `<span class="tag-sel">${esc(n)}<button type="button" data-tira="${i}" aria-label="Tirar ${esc(n)}">×</button></span>`).join('');
  }
  function desenharLista() {
    const q = input.value.trim();
    const nq = semAcento(q);
    const achados = (estado.problemas || [])
      .filter((p) => !sel.some((s) => mesmo(s, p.nome)) && semAcento(p.nome).includes(nq))
      .slice(0, 8);
    itens = achados.map((p) => ({ nome: p.nome, total: p.total }));
    const existe = (estado.problemas || []).some((p) => mesmo(p.nome, q)) || sel.some((s) => mesmo(s, q));
    if (q && !existe) itens.push({ nome: q, novo: true });
    if (ativo >= itens.length) ativo = itens.length - 1;
    lista.innerHTML = itens.length
      ? itens.map((it, i) => it.novo
        ? `<li role="option" data-i="${i}" class="combo-op novo ${i === ativo ? 'ativo' : ''}"><span class="mais">+</span><span>Adicionar “${esc(it.nome)}”</span></li>`
        : `<li role="option" data-i="${i}" class="combo-op ${i === ativo ? 'ativo' : ''}"><span>${destacar(it.nome, q)}</span><span class="combo-qtd">${it.total}</span></li>`).join('')
      : '<li class="combo-vazio">Digite o problema e aperte Enter para adicionar.</li>';
  }
  const abrir = () => { desenharLista(); lista.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const fechar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); ativo = -1; };
  function adicionar(nome) {
    nome = nome.trim().slice(0, 60);
    if (!nome || sel.some((s) => mesmo(s, nome)) || sel.length >= 12) return;
    // usa a grafia já salva quando o problema existe ("nao tem site" vira "Não tem site")
    const salvo = (estado.problemas || []).find((p) => mesmo(p.nome, nome));
    sel.push(salvo ? salvo.nome : nome);
    input.value = '';
    desenharChips();
    fechar();
  }

  caixa.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tira]');
    if (t) { sel.splice(Number(t.dataset.tira), 1); desenharChips(); input.focus(); return; }
    if (e.target.closest('.tags-caixa')) input.focus();
  });
  // a lista de sugestões só aparece enquanto a pessoa digita
  const atualizar = () => { if (input.value.trim()) abrir(); else fechar(); };
  input.addEventListener('input', () => { ativo = input.value.trim() ? 0 : -1; atualizar(); });
  input.addEventListener('blur', () => setTimeout(fechar, 120));
  input.addEventListener('keydown', (e) => {
    const aberto = !lista.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) { abrir(); return; }
      if (!itens.length) return;
      ativo = e.key === 'ArrowDown' ? (ativo + 1) % itens.length : (ativo - 1 + itens.length) % itens.length;
      desenharLista();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // nunca envia o formulário daqui
      if (ativo >= 0 && itens[ativo]) adicionar(itens[ativo].nome);
      else if (input.value.trim()) adicionar(input.value);
    } else if (e.key === 'Backspace' && !input.value && sel.length) {
      sel.pop(); desenharChips();
    } else if (e.key === 'Escape' && aberto) {
      e.preventDefault(); e.stopPropagation();
      combo.segurarEsc = true; setTimeout(() => (combo.segurarEsc = false), 0);
      fechar();
    } else if (e.key === ',') {
      e.preventDefault();
      if (input.value.trim()) adicionar(input.value);
    }
  });
  lista.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const li = e.target.closest('[data-i]');
    if (li) adicionar(itens[Number(li.dataset.i)].nome);
  });

  return {
    definir(nomes) { sel = [...nomes]; input.value = ''; fechar(); desenharChips(); },
    valores: () => [...sel],
    confirmarDigitado() { if (input.value.trim()) adicionar(input.value); },
  };
})();

// =====================================================
//  OBSERVAÇÕES: anotações e problemas em comum
// =====================================================
const filtroObs = criarFiltro($('#fp-obs'), 'observacoes', () => carregarObs().catch((err) => toast(err.message, 'erro')));
estado.obsProblema = null;

async function carregarObs() {
  filtroObs.desenhar();
  // nichos no filtro
  const sn = $('#obs-nicho');
  const vn = sn.value;
  sn.innerHTML = '<option value="">Todos os nichos</option>' + estado.nichos.map((n) => `<option value="${n.id}">${esc(n.nome)}</option>`).join('');
  sn.value = vn;

  const p = new URLSearchParams(filtroObs.query());
  if ($('#obs-busca').value.trim()) p.set('q', $('#obs-busca').value.trim());
  if (sn.value) p.set('nicho', sn.value);
  if (estado.obsProblema) p.set('problema', estado.obsProblema);
  const d = await api('/api/observacoes?' + p);
  estado.obs = d;

  // ranking de problemas
  const tot = d.totalEmpresas || 0;
  $('#obs-sub').textContent = tot
    ? `Entre ${tot} empresa${tot === 1 ? '' : 's'} prospectada${tot === 1 ? '' : 's'} (${filtroObs.rotulo()}). Clique para ver quais são.`
    : `Nenhuma empresa prospectada (${filtroObs.rotulo()}).`;
  const max = Math.max(1, ...d.problemas.map((x) => x.total));
  $('#obs-problemas').innerHTML = d.problemas.length
    ? d.problemas.map((x) => {
      const pct = tot ? Math.round((x.total / tot) * 100) : 0;
      const dica = `<b>${esc(x.nome)}</b><br>`
        + `<span class="linha-dica"><span>Empresas</span><b>${x.total} (${pct}%)</b></span>`
        + `<span class="linha-dica"><span>Aceitaram</span><b>${x.aceitou}</b></span>`
        + x.nichos.map((n) => `<span class="linha-dica"><span>${esc(n.nicho)}</span><b>${n.total}</b></span>`).join('');
      return `<button type="button" class="prob-linha ${estado.obsProblema === x.id ? 'ativa' : ''}" data-pid="${x.id}" ${tip(dica)}>
        <div class="rk-top"><strong>${esc(x.nome)}</strong><b>${x.total} <span class="dica">· ${pct}%</span></b></div>
        <div class="trilho"><div class="barra" style="width:${(x.total / max) * 100}%"></div></div>
        ${x.nichos.length ? `<span class="prob-nichos">Mais em: ${x.nichos.map((n) => `${esc(n.nicho)} (${n.total})`).join(', ')}</span>` : ''}
      </button>`;
    }).join('')
    : '<p class="dica">Nenhum problema marcado ainda. Ao cadastrar ou editar uma prospecção, use o campo "Problemas da empresa".</p>';

  // filtro ativo
  const probAtivo = d.problemas.find((x) => x.id === estado.obsProblema);
  $('#obs-ativo').innerHTML = estado.obsProblema
    ? `<span class="filtro-ativo">Problema: ${esc(probAtivo ? probAtivo.nome : 'selecionado')}<button type="button" id="obs-limpar" aria-label="Tirar filtro">×</button></span>` : '';
  $('#obs-titulo').textContent = estado.obsProblema ? 'Empresas com esse problema' : 'Anotações';
  $('#obs-qtd').textContent = `${d.itens.length} empresa${d.itens.length === 1 ? '' : 's'}`;

  // lista de anotações
  const q = $('#obs-busca').value.trim();
  const marcar = (texto) => {
    const t = esc(texto);
    if (!q) return t;
    const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return t.replace(re, (m) => `<mark>${m}</mark>`);
  };
  $('#obs-lista').innerHTML = d.itens.length
    ? d.itens.map((x) => {
      const m = membro(x.usuario_id, x.usuario_nome);
      return `<button type="button" class="obs-item" data-id="${x.id}">
        <span class="obs-cab"><strong>${marcar(x.empresa)}</strong>${x.nicho ? `<span class="tag">${esc(x.nicho)}</span>` : ''}<span class="chip ${x.status}">${STATUS[x.status]}</span></span>
        ${x.problemas.length ? `<span class="chips-prob">${x.problemas.map((n) => `<span class="prob-chip">${esc(n)}</span>`).join('')}</span>` : ''}
        ${x.anotacoes ? `<span class="obs-texto">${marcar(x.anotacoes)}</span>` : ''}
        <span class="obs-pe">${avatar(m, 20)} ${esc(primeiroNome(m.nome))} · ${dataCurta(x.atualizado_em)}</span>
      </button>`;
    }).join('')
    : '<div class="vazio"><strong>Nada por aqui</strong>Nenhuma empresa com anotação ou problema nesse filtro.</div>';
}

$('#obs-problemas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]');
  if (!b) return;
  const id = Number(b.dataset.pid);
  estado.obsProblema = estado.obsProblema === id ? null : id; // clicar de novo tira o filtro
  dicaEl.hidden = true;
  carregarObs().catch((err) => toast(err.message, 'erro'));
});
$('#obs-ativo').addEventListener('click', (e) => {
  if (e.target.closest('#obs-limpar')) { estado.obsProblema = null; carregarObs().catch((err) => toast(err.message, 'erro')); }
});
$('#obs-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) abrirDetalhe(Number(b.dataset.id));
});
let tObs;
$('#obs-busca').addEventListener('input', () => { clearTimeout(tObs); tObs = setTimeout(() => carregarObs().catch((err) => toast(err.message, 'erro')), 250); });
$('#obs-nicho').addEventListener('change', () => carregarObs().catch((err) => toast(err.message, 'erro')));

// =====================================================
//  NICHOS: todos os nichos, com filtro de período
// =====================================================
const filtroNichos = criarFiltro($('#fp-nichos'), 'nichos', () => carregarNichos().catch((err) => toast(err.message, 'erro')));

async function carregarNichos() {
  filtroNichos.desenhar();
  estado.nichosAba = await api('/api/painel/nichos?' + filtroNichos.query());
  renderNichos();
}

function renderNichos() {
  const q = semAcento($('#ni-busca').value);
  const ordem = $('#ni-ordem').value;
  // posição = ordem por mais prospectados (como veio do servidor)
  let lista = (estado.nichosAba || []).map((n, i) => ({ ...n, pos: i + 1, taxa: n.total ? n.aceitou / n.total : 0 }));
  if (q) lista = lista.filter((n) => semAcento(n.nome).includes(q));
  if (ordem === 'taxa') lista.sort((a, b) => b.taxa - a.taxa || b.total - a.total);
  else if (ordem === 'aceitou') lista.sort((a, b) => b.aceitou - a.aceitou || b.total - a.total);
  else if (ordem === 'nome') lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#ni-titulo').textContent = `${lista.length} nicho${lista.length === 1 ? '' : 's'} · ${filtroNichos.rotulo()}`;
  const max = Math.max(1, ...lista.map((n) => n.total));
  $('#ni-lista').innerHTML = lista.length ? lista.map((n) => {
    const seg = ['aceitou', 'pensando', 'recusou'].filter((k) => n[k] > 0)
      .map((k) => `<i class="s-${k}" style="flex:${n[k]}" ${tip(`<b>${esc(n.nome)}</b><br>${STATUS[k]}: <b>${n[k]}</b> de ${n.total}`)}></i>`).join('');
    const m = n.top ? membro(n.top.id, n.top.nome) : null;
    return `<button type="button" class="ni-linha" data-nicho="${n.id ?? 'sem'}">
      <span class="pos">${n.pos}º</span>
      <span>
        <span class="rk-top"><strong>${esc(n.nome)}</strong><b>${n.total}</b></span>
        <span class="trilho" style="display:block"><span class="barra" style="width:${(n.total / max) * 100}%">${seg}</span></span>
        <span class="rk-detalhe" style="display:block">${n.aceitou} aceitaram (${Math.round(n.taxa * 100)}%) · ${n.pensando} pensando · ${n.recusou} recusaram · última em ${dataCurta(n.ultima)}</span>
      </span>
      ${m ? `<span class="ni-top">${avatar(m, 30)}<span class="nomes"><strong>${esc(n.top.nome)}</strong><span>mais prospectou · ${n.top.total}</span></span></span>` : '<span></span>'}
    </button>`;
  }).join('') : '<div class="vazio"><strong>Nenhum nicho</strong>Nada prospectado nesse período ou com essa busca.</div>';
}
$('#ni-lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nicho]');
  if (b) irParaNicho(b.dataset.nicho === 'sem' ? null : Number(b.dataset.nicho), filtroNichos);
});
$('#ni-busca').addEventListener('input', renderNichos);
$('#ni-ordem').addEventListener('change', renderNichos);
// "Ver todos os nichos" do painel leva o mesmo período
$('#link-nichos').addEventListener('click', () => filtroNichos.definir(filtroPainel.estado));

// =====================================================
//  PAINEL
// =====================================================
const filtroPainel = criarFiltro($('#fp-painel'), 'painel', () => carregarPainel().catch((err) => toast(err.message, 'erro')));

async function carregarPainel() {
  filtroPainel.desenhar();
  $('#painel-rotulo').textContent = `Mostrando ${filtroPainel.rotulo()}`;
  const [d] = await Promise.all([api('/api/painel?' + filtroPainel.query()), carregarRelatorio()]);
  const t = d.totais;
  const taxa = t.total ? Math.round((t.aceitou / t.total) * 100) : 0;

  $('#kpis').innerHTML = `
    <div class="kpi"><span>Empresas prospectadas</span><strong>${t.total}</strong></div>
    <div class="kpi"><span><i class="s-aceitou"></i>Aceitaram</span><strong>${t.aceitou}</strong></div>
    <div class="kpi"><span><i class="s-pensando"></i>Pensando</span><strong>${t.pensando}</strong></div>
    <div class="kpi"><span><i class="s-recusou"></i>Recusaram</span><strong>${t.recusou}</strong></div>
    <div class="kpi"><span>Taxa de aceite</span><strong>${taxa}%</strong></div>`;

  estado.rankingPainel = d.ranking;
  renderRanking();

  // por nicho: só o top 5 (a lista completa fica na aba Nichos)
  const top = d.nichos.slice(0, 5);
  const maxN = Math.max(1, ...top.map((n) => n.total));
  $('#por-nicho').innerHTML = top.length
    ? top.map((n) => `
        <div class="nicho-linha clicavel" data-nicho="${n.id ?? 'sem'}" role="button" tabindex="0"
             ${tip(`<b>${esc(n.nome)}</b><br>`
               + `<span class="linha-dica"><span>Prospectadas</span><b>${n.total}</b></span>`
               + `<span class="linha-dica"><span>Aceitaram</span><b>${n.aceitou}</b></span>`
               + `<span class="linha-dica"><span>Pensando</span><b>${n.pensando}</b></span>`
               + `<span class="linha-dica"><span>Recusaram</span><b>${n.recusou}</b></span>`
               + (n.top ? `<span class="linha-dica"><span>Mais prospectou</span><b>${esc(primeiroNome(n.top.nome))} (${n.top.total})</b></span>` : '')
               + '<br>Clique para ver as empresas')}>
          <div class="rk-top"><strong>${esc(n.nome)}</strong><b>${n.total}</b></div>
          <div class="trilho"><div class="barra" style="width:${(n.total / maxN) * 100}%"></div></div>
          <div class="rk-detalhe">${n.aceitou} aceitaram (${Math.round((n.aceitou / n.total) * 100)}%)</div>
        </div>`).join('')
    : '<p class="dica">Nenhuma prospecção neste período.</p>';
  $('#link-nichos').textContent = d.nichos.length > 5 ? `Ver todos os ${d.nichos.length} nichos` : 'Ver aba Nichos';
}

// "Quem mais prospectou": top 5, com opção de abrir o ranking completo ali mesmo
let rankingAberto = false;
function renderRanking() {
  const lista = estado.rankingPainel || [];
  const mostrar = rankingAberto ? lista : lista.slice(0, 5);
  const max = Math.max(1, ...lista.map((r) => r.total));
  const el = $('#ranking');
  el.classList.toggle('ranking-todos', rankingAberto);
  el.innerHTML = mostrar.length
    ? mostrar.map((r, i) => {
        const seg = ['aceitou', 'pensando', 'recusou']
          .filter((k) => r[k] > 0)
          .map((k) => `<i class="s-${k}" style="flex:${r[k]}" ${tip(`<b>${esc(r.nome)}</b><br>${STATUS[k]}: <b>${r[k]}</b> de ${r.total} (${Math.round((r[k] / r.total) * 100)}%)`)}></i>`).join('');
        return `
          <div class="rk clicavel" data-id="${r.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${esc(r.nome)}">
            <span class="pos">${i + 1}º</span>
            ${avatar(r, 44)}
            <div>
              <div class="rk-top"><strong>${esc(r.nome)}${selo(r)}${r.id === estado.eu.id ? ' (você)' : ''}</strong><b>${r.total}</b></div>
              <div class="trilho"><div class="barra" style="width:${(r.total / max) * 100}%">${seg}</div></div>
              <div class="rk-detalhe">${r.aceitou} aceitou · ${r.pensando} pensando · ${r.recusou} recusou</div>
            </div>
          </div>`;
      }).join('')
    : '<div class="vazio"><strong>Sem dados</strong>Cadastre funcionários e registre prospecções.</div>';
  const b = $('#btn-ranking-todos');
  b.hidden = lista.length <= 5;
  b.textContent = rankingAberto ? 'Mostrar só o top 5' : `Ver ranking completo (${lista.length})`;
}
$('#btn-ranking-todos').addEventListener('click', () => { rankingAberto = !rankingAberto; renderRanking(); });

// clicar num nicho do painel abre as prospecções dele
$('#por-nicho').addEventListener('click', (e) => {
  const n = e.target.closest('[data-nicho]');
  if (n) irParaNicho(n.dataset.nicho === 'sem' ? null : Number(n.dataset.nicho), filtroPainel);
});
$('#por-nicho').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-nicho]')) e.target.click();
});

// ---------- relatório mês a mês ----------
async function carregarRelatorio() {
  const f = filtroPainel.estado;
  // no personalizado, mostra os meses do ano da data inicial (ou todos)
  const ano = f.modo === 'pers' ? (f.de ? f.de.slice(0, 4) : 'todos') : f.ano;
  const meses = await api('/api/painel/meses?ano=' + ano);
  const el = $('#relatorio');
  if (!meses.length || meses.every((m) => !m.total)) {
    el.innerHTML = '<p class="dica">Nenhuma prospecção nesse ano ainda.</p>';
    return;
  }
  const max = Math.max(1, ...meses.map((m) => m.total));
  const ativo = f.modo === 'mes' && f.mes ? `${f.ano}-${String(f.mes).padStart(2, '0')}` : '';
  let anoGrupo = '';
  el.innerHTML = meses.map((m) => {
    const [a, mm] = m.mes.split('-');
    const cab = a !== anoGrupo ? `<div class="rel-ano">${a}</div>` : '';
    anoGrupo = a;
    const taxa = m.total ? Math.round((m.aceitou / m.total) * 100) : 0;
    const seg = ['aceitou', 'pensando', 'recusou'].filter((k) => m[k] > 0)
      .map((k) => `<i class="s-${k}" style="flex:${m[k]}"></i>`).join('');
    const [top, ...outros] = m.pessoas;
    const dicaMes = `<b>${MESES_LONGO[Number(mm) - 1]} de ${a}</b><br>`
      + m.pessoas.map((p, i) => `<span class="linha-dica"><span>${i + 1}º ${esc(p.nome)}</span><b>${p.total}</b></span>`).join('')
      + (m.pessoas.length ? '' : 'Sem prospecções');
    return `${cab}<button type="button" class="rel-linha ${m.mes === ativo ? 'ativa' : ''} ${m.total ? '' : 'vazia'}" data-mes="${m.mes}" ${tip(dicaMes)}>
      <span class="rel-mes">${MESES_LONGO[Number(mm) - 1]}</span>
      <span>
        <div class="trilho"><div class="barra" style="width:${(m.total / max) * 100}%">${seg}</div></div>
        <div class="rel-num">${m.total} prospecç${m.total === 1 ? 'ão' : 'ões'} · ${m.aceitou} aceitaram (${taxa}%)</div>
      </span>
      ${top ? `<span class="rel-top">${avatar(membro(top.id, top.nome), 30)}
        <span class="nomes"><strong>${esc(top.nome)}${seloDe(top.id)}</strong><span>prospectou mais · ${top.total}</span></span>
        <span class="rel-outros">${outros.slice(0, 3).map((p) => avatar(membro(p.id, p.nome), 24)).join('')}</span></span>`
        : '<span class="rel-top"><span class="dica">—</span></span>'}
    </button>`;
  }).join('');
}
$('#relatorio').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mes]');
  if (!b) return;
  const [a, m] = b.dataset.mes.split('-').map(Number);
  const f = filtroPainel.estado;
  // clicar no mês já escolhido volta para o ano todo
  if (f.modo === 'mes' && String(a) === f.ano && f.mes === m) filtroPainel.irPara(a, 0);
  else filtroPainel.irPara(a, m);
  $('#fp-painel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// =====================================================
//  EQUIPE (só ADM)
// =====================================================
let usuarios = [];
let editandoUsuario = null;

const filtroEquipe = criarFiltro($('#fp-equipe'), 'equipe', () => carregarUsuarios().catch((err) => toast(err.message, 'erro')));

async function carregarUsuarios() {
  filtroEquipe.desenhar();
  const [lista, painel] = await Promise.all([api('/api/usuarios'), api('/api/painel?' + filtroEquipe.query())]);
  usuarios = lista;
  // posição no ranking do período escolhido
  // posição só entre funcionários; ADM e gerente mostram os números, sem posição
  const rk = new Map(painel.ranking.map((r) => [r.id, { ...r }]));
  painel.ranking.filter((r) => r.papel === 'funcionario').forEach((r, i) => (rk.get(r.id).pos = i + 1));
  estado.eqDados = usuarios.map((u) => ({ ...u, rk: rk.get(u.id) || null }));
  renderUsuarios();
}

function renderUsuarios() {
  const q = semAcento($('#eq-busca').value);
  const ordem = $('#eq-ordem').value;
  let lista = [...(estado.eqDados || [])];
  if (q) lista = lista.filter((u) => semAcento(`${u.nome} ${u.login}`).includes(q));
  const taxa = (u) => (u.rk && u.rk.total ? u.rk.aceitou / u.rk.total : -1);
  const pos = (u) => (u.papel === 'funcionario' ? u.rk?.pos ?? 9999 : 9999);
  if (ordem === 'nome') lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  else if (ordem === 'taxa') lista.sort((a, b) => taxa(b) - taxa(a));
  else lista.sort((a, b) => pos(a) - pos(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  // ADM sempre em cima, depois gerentes; o ranking é só dos funcionários
  const ORDEM_CARGO = { admin: 0, gerente: 1, funcionario: 2 };
  lista.sort((a, b) => ORDEM_CARGO[a.papel] - ORDEM_CARGO[b.papel] || (a.id === estado.eu.id ? -1 : b.id === estado.eu.id ? 1 : 0));
  const medalha = (p) => (p === 1 ? 'ouro' : p === 2 ? 'prata' : p === 3 ? 'bronze' : '');
  $('#lista-usuarios').innerHTML = lista.length ? lista.map((u) => {
    const r = u.rk;
    const tx = r && r.total ? Math.round((r.aceitou / r.total) * 100) : 0;
    return `
    <div class="usuario ${u.ativo ? '' : 'inativo'}" data-uid="${u.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${esc(u.nome)}">
      ${u.papel === 'funcionario'
        ? `<span class="pos-eq ${r?.pos ? medalha(r.pos) : ''}" title="Posição no ranking (${esc(filtroEquipe.rotulo())})">${r?.pos ? `${r.pos}º` : '—'}</span>`
        : `<span class="pos-eq cargo-ico ${u.papel}" title="${NOME_CARGO[u.papel]} — fora do ranking">${u.papel === 'admin' ? '★' : '◆'}</span>`}
      ${avatar(u, 42)}
      <div class="info">
        <strong>${esc(u.nome)}${selo(u)}
          ${u.papel === 'admin' ? '<span class="selo admin">ADM</span>' : ''}
          ${u.papel === 'gerente' ? `<span class="selo gerente" ${tip(`<b>Gerente</b><br>Vê tudo. Pode alterar: ${esc(listaPerms(u.permissoes))}`)}>Gerente</span>` : ''}
          ${u.ativo ? '' : '<span class="selo off">Desativado</span>'}
        </strong>
        <span>login: ${esc(u.login)} · ${u.prospeccoes} no total</span>
      </div>
      <span class="num-eq principal"><strong>${r ? r.total : 0}</strong><span>prospecções</span></span>
      <span class="num-eq"><strong>${r ? r.aceitou : 0}</strong><span>aceitaram</span></span>
      <span class="num-eq"><strong>${tx}%</strong><span>taxa</span></span>
      <div class="acoes">
        ${podeMexerEm(u) ? `<button class="btn pequeno" data-editar="${u.id}">Editar</button>
        ${u.id !== estado.eu.id ? `<button class="btn pequeno fantasma perigo" data-excluir="${u.id}">Excluir</button>` : ''}` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="vazio"><strong>Ninguém encontrado</strong>Confira o nome ou o login digitado.</div>';
}
// admin mexe em todos; gerente com "equipe" só em funcionários
const podeMexerEm = (u) => ehAdmin() || (pode('equipe') && u.papel === 'funcionario');
const PERM_NOMES = { contratos: 'contratos', regra: 'regra de comissão', equipe: 'equipe', prospeccoes: 'prospecções de todos' };
const listaPerms = (p) => Object.keys(PERM_NOMES).filter((k) => p?.[k]).map((k) => PERM_NOMES[k]).join(', ') || 'nada (só vê)';

$('#eq-busca').addEventListener('input', renderUsuarios);
$('#eq-ordem').addEventListener('change', renderUsuarios);
$('#lista-usuarios').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-uid]')) abrirFuncionario(Number(e.target.dataset.uid), filtroEquipe);
});

$('#lista-usuarios').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-editar]');
  const ex = e.target.closest('[data-excluir]');
  const linha = e.target.closest('[data-uid]');
  if (!ed && !ex && linha) { abrirFuncionario(Number(linha.dataset.uid), filtroEquipe); return; }
  if (ed) abrirFormUsuario(usuarios.find((u) => u.id === Number(ed.dataset.editar)));
  if (ex) {
    const u = usuarios.find((x) => x.id === Number(ex.dataset.excluir));
    if (!confirm(`Excluir ${u.nome}? Essa pessoa não vai mais conseguir entrar.`)) return;
    try {
      await api(`/api/usuarios/${u.id}`, { method: 'DELETE' });
      toast('Usuário excluído');
    } catch (err) {
      if (err.status === 409 && u.ativo && confirm(err.message + '\n\nDesativar o acesso agora?')) {
        await api(`/api/usuarios/${u.id}`, { method: 'PUT', body: { ativo: false } });
        toast('Acesso desativado');
      } else if (err.status !== 409 || !u.ativo) {
        toast(err.message, 'erro');
      }
    }
    await carregarUsuarios();
    estado.equipe = await api('/api/equipe');
    preencherFiltros();
  }
});

function abrirFormUsuario(u = null) {
  editandoUsuario = u;
  const f = $('#form-usuario');
  f.reset();
  $('#usuario-erro').textContent = '';
  $('#dlg-usuario-titulo').textContent = u ? `Editar ${u.nome}` : 'Novo funcionário';
  f.senha.required = !u;
  f.senha.placeholder = u ? 'Deixe em branco para manter a atual' : '';
  $('#dica-senha').textContent = u
    ? 'Preencha só se quiser trocar a senha dessa pessoa.'
    : 'Mínimo de 6 caracteres. Passe essa senha para a pessoa.';
  $('#campo-ativo').hidden = !u;
  // cargo, permissões e selo: só o ADM mexe
  $('#campo-cargo').hidden = !ehAdmin();
  if (u) {
    f.nome.value = u.nome;
    f.login.value = u.login;
    f.papel.value = u.papel;
    f.ativo.checked = u.ativo;
    f.verificado.checked = Boolean(u.verificado);
    for (const k of Object.keys(PERM_NOMES)) f['perm_' + k].checked = Boolean(u.permissoes?.[k]);
  }
  // não dá para tirar o próprio cargo de ADM
  f.papel.disabled = u?.id === estado.eu.id;
  mostrarPermissoes();
  $('#dlg-usuario').showModal();
  setTimeout(() => f.nome.focus(), 50);
}

$('#btn-novo-usuario').addEventListener('click', () => abrirFormUsuario());
function mostrarPermissoes() {
  const f = $('#form-usuario');
  $('#campo-permissoes').hidden = f.papel.value !== 'gerente';
  $('#dlg-usuario-titulo').textContent = editandoUsuario ? `Editar ${editandoUsuario.nome}` : `Novo ${NOME_CARGO[f.papel.value].toLowerCase()}`;
}
$('#form-usuario').papel.addEventListener('change', mostrarPermissoes);

$('#form-usuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const corpo = { nome: f.nome.value, login: f.login.value };
  if (ehAdmin()) {
    if (!f.papel.disabled) corpo.papel = f.papel.value;
    corpo.verificado = f.verificado.checked;
    corpo.permissoes = Object.fromEntries(Object.keys(PERM_NOMES).map((k) => [k, f['perm_' + k].checked]));
  }
  if (f.senha.value) corpo.senha = f.senha.value;
  if (editandoUsuario) corpo.ativo = f.ativo.checked;
  try {
    if (editandoUsuario) {
      await api(`/api/usuarios/${editandoUsuario.id}`, { method: 'PUT', body: corpo });
      toast('Usuário atualizado');
    } else {
      await api('/api/usuarios', { method: 'POST', body: corpo });
      toast(`Login de ${corpo.nome} criado!`);
    }
    $('#dlg-usuario').close();
    await carregarUsuarios();
    estado.equipe = await api('/api/equipe');
    if (editandoUsuario?.id === estado.eu.id) {
      estado.eu = await api('/api/me');
      aplicarCargo();
      renderEu();
    }
    preencherFiltros();
  } catch (err) {
    $('#usuario-erro').textContent = err.message;
  }
});

// =====================================================
//  DETALHES DO FUNCIONÁRIO (clique no painel)
// =====================================================
$('#ranking').addEventListener('click', (e) => {
  const r = e.target.closest('[data-id]');
  if (r) abrirFuncionario(Number(r.dataset.id));
});
$('#ranking').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-id]')) {
    e.preventDefault();
    abrirFuncionario(Number(e.target.dataset.id));
  }
});

// "Ver o financeiro de Fulano": abre o Financeiro já filtrado pela pessoa e pelo mesmo período
$('#func-corpo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver-fin]');
  if (!b) return;
  $('#dlg-func').close();
  $('#fin-busca').value = b.dataset.verFin;
  if (estado.ultimoFiltroFunc) filtroFin.definir(estado.ultimoFiltroFunc.estado);
  if (location.hash === '#financeiro') carregarFinanceiro().catch((err) => toast(err.message, 'erro'));
  else location.hash = '#financeiro';
});

async function abrirFuncionario(id, filtro = filtroPainel) {
  estado.ultimoFiltroFunc = filtro;
  dicaEl.hidden = true;
  let d;
  try { d = await api(`/api/painel/usuario/${id}?${filtro.query()}`); } catch (err) { return toast(err.message, 'erro'); }
  const u = d.usuario;
  const n = d.numeros;
  const taxa = n.total ? Math.round((n.aceitou / n.total) * 100) : 0;
  const seg = ['aceitou', 'pensando', 'recusou'].filter((k) => n[k] > 0)
    .map((k) => `<i class="s-${k}" style="flex:${n[k]}" title="${STATUS[k]}: ${n[k]}"></i>`).join('');

  let dinheiro = '';
  if (d.financeiro) {
    const f = d.financeiro;
    const t = f.totais;
    const souEu = u.papel === 'admin';
    const ehVoce = u.id === estado.eu.id;
    dinheiro = `
      <div class="func-secao">
        <h4>${souEu ? `Contratos fechados ${ehVoce ? 'por você' : 'pelo ADM'}` : 'Quanto vai receber'} <span class="opcional">só a gestão vê</span></h4>
        <div class="func-dinheiro">
          <div><span>Contratos fechados</span><strong>${t.contratos}</strong></div>
          <div><span>Total vendido</span><strong class="dinheiro">${brl(t.vendido)}</strong></div>
          ${souEu ? '' : `
          <div><span>Comissão total</span><strong class="dinheiro">${brl(t.comissao)}</strong></div>
          <div class="forte"><span>Falta pagar</span><strong class="dinheiro">${brl(t.aPagar)}</strong></div>`}
        </div>
        <button type="button" class="btn pequeno" data-ver-fin="${esc(u.nome)}">Ver o financeiro ${ehVoce ? 'dos seus contratos' : `de ${esc(primeiroNome(u.nome))}`}</button>
      </div>`;
  }

  $('#func-corpo').innerHTML = `
    <div class="dlg-cab">
      <div class="func-topo">${avatar(u, 56)}<div><h3>${esc(u.nome)}${selo(u)}</h3>
        <p class="dica">${u.papel === 'funcionario' ? '' : `${NOME_CARGO[u.papel]} · `}Período: ${esc(filtro.rotulo())}${u.ativo ? '' : ' · acesso desativado'}</p></div></div>
      <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
    </div>
    <div class="func-numeros">
      <div><span>Total</span><strong>${n.total}</strong></div>
      <div><span><i class="s-aceitou"></i>Aceitaram</span><strong>${n.aceitou}</strong></div>
      <div><span><i class="s-pensando"></i>Pensando</span><strong>${n.pensando}</strong></div>
      <div><span><i class="s-recusou"></i>Recusaram</span><strong>${n.recusou}</strong></div>
    </div>
    <div>
      <div class="trilho"><div class="barra" style="width:${n.total ? 100 : 0}%">${seg}</div></div>
      <p class="dica">Taxa de aceite: <b>${taxa}%</b></p>
    </div>
    ${dinheiro}
    <div class="func-secao">
      <h4>Últimas prospecções</h4>
      ${d.recentes.length ? `<div class="mini-lista">${d.recentes.map((p) => `
        <div><span>${esc(p.empresa)}${p.nicho ? ` · ${esc(p.nicho)}` : ''}</span><span class="chip ${p.status}">${STATUS[p.status]}</span></div>`).join('')}</div>`
        : '<p class="dica">Nenhuma prospecção neste período.</p>'}
    </div>`;
  if (!$('#dlg-func').open) $('#dlg-func').showModal();
}

// =====================================================
//  FINANCEIRO (só ADM)
// =====================================================
const filtroFin = criarFiltro($('#fp-fin'), 'financeiro', () => carregarFinanceiro().catch((err) => toast(err.message, 'erro')));

async function carregarFinanceiro() {
  filtroFin.desenhar();
  const d = await api('/api/financeiro?' + filtroFin.query());
  estado.regra = d.regra;
  estado.fin = d;
  renderFinanceiro();
  renderRegra();
  renderCriador();
}

// soma igual à do servidor, para recalcular quando a busca filtra uma pessoa
function somarContratos(lista) {
  const t = lista.reduce((a, c) => ({
    contratos: a.contratos + 1, vendido: a.vendido + c.valor, comissao: a.comissao + c.comissao,
    lucro: a.lucro + c.lucro, pago: a.pago + (c.comissao_paga ? c.comissao : 0),
  }), { contratos: 0, vendido: 0, comissao: 0, lucro: 0, pago: 0 });
  for (const k of ['vendido', 'comissao', 'lucro', 'pago']) t[k] = centavos(t[k]);
  t.aPagar = centavos(t.comissao - t.pago);
  t.ticket = t.contratos ? centavos(t.vendido / t.contratos) : 0;
  return t;
}

// aplica a busca de funcionário em tudo da tela (menos no criador de gráficos)
function renderFinanceiro() {
  const d = estado.fin;
  if (!d) return;
  const q = semAcento($('#fin-busca').value);
  const bate = (nome) => !q || semAcento(nome || '').includes(q);
  const contratos = d.contratos.filter((c) => bate(c.usuario_nome));
  const porFuncionario = d.porFuncionario.filter((f) => bate(f.nome));
  const pendentes = d.pendentes.filter((p) => bate(p.usuario_nome));
  const t = q ? somarContratos(contratos) : d.totais;
  const meses = q ? d.porMes.map((m) => {
    const doMes = contratos.filter((c) => c.fechado_em.startsWith(m.mes));
    const s = somarContratos(doMes);
    return { mes: m.mes, vendido: s.vendido, comissao: s.comissao, lucro: s.lucro };
  }) : d.porMes;

  const aviso = $('#fin-aviso');
  aviso.hidden = !q;
  if (q) {
    const nomes = [...new Set(porFuncionario.map((f) => f.nome))];
    aviso.innerHTML = nomes.length
      ? `Mostrando só o financeiro de <b>${nomes.map(esc).join(', ')}</b> (${t.contratos} contrato${t.contratos === 1 ? '' : 's'}). <button type="button" class="link-btn" id="fin-limpar">Ver todos</button>`
      : `Nenhum funcionário com contrato encontrado para “${esc($('#fin-busca').value)}”. <button type="button" class="link-btn" id="fin-limpar">Ver todos</button>`;
  }
  const pctLucro = t.vendido ? Math.round((t.lucro / t.vendido) * 100) : 0;
  $('#fin-kpis').innerHTML = `
    <div class="kpi"><span>Faturamento</span><strong class="dinheiro">${brl(t.vendido)}</strong><small>${t.contratos} contrato${t.contratos === 1 ? '' : 's'} · ticket médio ${brl(t.ticket)}</small></div>
    <div class="kpi destaque"><span>${rotLucro()}</span><strong class="dinheiro">${brl(t.lucro)}</strong><small>${pctLucro}% do faturamento</small></div>
    <div class="kpi"><span><i class="s-comissao"></i>Comissões${q ? '' : ' da equipe'}</span><strong class="dinheiro">${brl(t.comissao)}</strong><small>Regra: ${brl(d.regra.fixa)} + ${fmtPct(d.regra.percentual)}%</small></div>
    <div class="kpi"><span>Comissões a pagar</span><strong class="dinheiro">${brl(t.aPagar)}</strong><small>Já pago: ${brl(t.pago)}</small></div>
    <div class="kpi"><span><i class="s-aceitou"></i>Aceitas sem contrato</span><strong>${pendentes.length}</strong><small>${pendentes.length ? 'Registre o valor abaixo' : 'Tudo em dia'}</small></div>`;

  renderMeses(meses, contratos);
  renderFinEquipe(porFuncionario);
  renderPendentes(pendentes);
  renderContratos(contratos);
}
let tFin;
$('#fin-busca').addEventListener('input', () => { clearTimeout(tFin); tFin = setTimeout(renderFinanceiro, 150); });
$('#fin-aviso').addEventListener('click', (e) => {
  if (e.target.closest('#fin-limpar')) { $('#fin-busca').value = ''; renderFinanceiro(); }
});

function renderMeses(meses, contratos = estado.fin.contratos) {
  const el = $('#fin-meses');
  if (!meses.length) {
    el.innerHTML = '<p class="dica">Nenhum contrato neste período. Registre o primeiro em "Aceitaram e ainda não têm contrato".</p>';
    return;
  }
  const max = Math.max(1, ...meses.map((m) => m.vendido));
  // quantos contratos em cada mês (para a dica)
  const qtd = {};
  for (const c of contratos) qtd[c.fechado_em.slice(0, 7)] = (qtd[c.fechado_em.slice(0, 7)] || 0) + 1;
  // total do período escolhido (ex.: o ano todo) em cima do gráfico
  const tot = meses.reduce((t, m) => ({ v: t.v + m.vendido, l: t.l + m.lucro, c: t.c + m.comissao }), { v: 0, l: 0, c: 0 });
  const totalHtml = `<div class="meses-total">
      <div><span>Total · ${esc(filtroFin.rotulo())}</span><strong class="dinheiro">${brl(tot.v)}</strong></div>
      <div><span><i class="s-lucro"></i>${rotLucro()}</span><strong class="dinheiro">${brl(tot.l)}</strong></div>
      <div><span><i class="s-comissao"></i>Comissões</span><strong class="dinheiro">${brl(tot.c)}</strong></div>
    </div>`;
  el.innerHTML = totalHtml + `<div class="rolagem-x"><div class="meses" style="min-width:${meses.length * 34}px">${meses.map((m) => {
    const [a, mm] = m.mes.split('-');
    const h = (m.vendido / max) * 78;
    const pl = m.vendido ? (m.lucro / m.vendido) * 100 : 0;
    const dica = `<b>${MESES_LONGO[Number(mm) - 1]} de ${a}</b><br>`
      + `<span class="linha-dica"><span>Faturamento</span><b>${brl(m.vendido)}</b></span>`
      + `<span class="linha-dica"><span>${rotLucro()}</span><b>${brl(m.lucro)}</b></span>`
      + `<span class="linha-dica"><span>Comissões</span><b>${brl(m.comissao)}</b></span>`
      + `<span class="linha-dica"><span>Contratos</span><b>${qtd[m.mes] || 0}</b></span>`;
    return `<div class="mes ${m.vendido ? '' : 'mes-vazio'}" ${tip(dica)}>
      <span class="mes-valor">${m.vendido ? brlCurto(m.vendido).replace('R$ ', '') : ''}</span>
      <div class="mes-coluna" style="height:${h}%">${m.vendido ? `<i class="s-lucro" style="height:${pl}%"></i><i class="s-comissao" style="height:${100 - pl}%"></i>` : ''}</div>
      <span class="mes-nome">${MESES[Number(mm) - 1]}/${a.slice(2)}</span></div>`;
  }).join('')}</div></div>`;
}

function renderRegra() {
  const f = $('#form-regra');
  if (document.activeElement?.form !== f) {
    f.fixa.value = fmtValor(estado.regra.fixa);
    f.percentual.value = fmtPct(estado.regra.percentual);
  }
  atualizarExemplos();
}
function atualizarExemplos() {
  const f = $('#form-regra');
  const fixa = lerValor(f.fixa.value);
  const pct = lerValor(f.percentual.value);
  if (fixa === null || pct === null || Number.isNaN(fixa) || Number.isNaN(pct)) {
    $('#regra-exemplos').innerHTML = '<span>Preencha os dois campos para ver exemplos.</span>';
    return;
  }
  const r = { fixa, percentual: pct };
  $('#regra-exemplos').innerHTML = [450, 900, 1500].map((v) => {
    const c = comissaoAuto(v, r);
    return `<span>Site de <b>${brl(v)}</b> → funcionário recebe <b>${brl(c)}</b>, ${ehAdmin() ? 'você fica' : 'a empresa fica'} com <b>${brl(v - c)}</b></span>`;
  }).join('');
}
$('#form-regra').addEventListener('input', atualizarExemplos);
$('#form-regra').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    estado.regra = await api('/api/financeiro/regra', {
      method: 'PUT', body: { fixa: lerValor(f.fixa.value), percentual: f.percentual.value },
    });
    toast('Regra de comissão salva');
    f.querySelector('button').blur();
    await carregarFinanceiro();
  } catch (err) { toast(err.message, 'erro'); }
});

function renderFinEquipe(lista) {
  const el = $('#fin-equipe');
  if (!lista.length) { el.innerHTML = '<p class="dica">Ainda não há contratos neste período.</p>'; return; }
  const max = Math.max(1, ...lista.map((f) => f.vendido));
  el.innerHTML = lista.map((f) => {
    const m = membro(f.id, f.nome);
    const souEu = f.papel === 'admin'; // ADM não tem comissão
    const ehVoce = f.id === estado.eu.id;
    const pct = f.vendido ? Math.round((f.comissao / f.vendido) * 100) : 0;
    const dica = `<b>${esc(f.nome)}</b><br>`
      + `<span class="linha-dica"><span>Vendeu</span><b>${brl(f.vendido)}</b></span>`
      + `<span class="linha-dica"><span>Contratos</span><b>${f.contratos}</b></span>`
      + `<span class="linha-dica"><span>Ticket médio</span><b>${brl(f.ticket)}</b></span>`
      + (souEu ? '<span class="linha-dica"><span>Comissão</span><b>não tem</b></span>' : `
        <span class="linha-dica"><span>Comissão</span><b>${brl(f.comissao)} (${pct}%)</b></span>
        <span class="linha-dica"><span>Já pago</span><b>${brl(f.pago)}</b></span>
        <span class="linha-dica"><span>Falta pagar</span><b>${brl(f.aPagar)}</b></span>`)
      + `<span class="linha-dica"><span>${rotLucro()}</span><b>${brl(f.lucro)}</b></span>`;
    return `<button type="button" class="fin-func" data-id="${f.id}" ${tip(dica)}>
      ${avatar(m, 42)}
      <div>
        <div class="rk-top"><strong>${esc(f.nome)}${selo(m)}${ehVoce ? ' (você)' : ''}</strong><b class="dinheiro">${brl(f.vendido)}</b></div>
        <div class="trilho dinheiro-trilho"><div class="barra" style="width:${(f.vendido / max) * 100}%">
          ${f.comissao > 0 ? `<i class="s-comissao" style="flex:${f.comissao}"></i>` : ''}<i class="s-vendido" style="flex:${Math.max(f.vendido - f.comissao, 0.0001)}"></i></div></div>
        <div class="rk-detalhe">${f.contratos} contrato${f.contratos === 1 ? '' : 's'} · ${souEu
          ? 'sem comissão'
          : `comissão <b>${brl(f.comissao)}</b> · falta pagar ${brl(f.aPagar)}`}</div>
      </div></button>`;
  }).join('');
}
$('#fin-equipe').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) { dicaEl.hidden = true; abrirFuncionario(Number(b.dataset.id), filtroFin); }
});

function renderPendentes(lista) {
  $('#fin-pendentes-box').hidden = !lista.length;
  $('#fin-pendentes').innerHTML = lista.map((p) => `
    <div class="pendente">
      <div><strong>${esc(p.empresa)}</strong><span>${p.nicho ? esc(p.nicho) + ' · ' : ''}aceitou com ${esc(membro(p.usuario_id, p.usuario_nome).nome)}</span></div>
      ${pode('contratos') ? `<button type="button" class="btn pequeno primario" data-pid="${p.id}">Registrar contrato</button>` : '<span class="selo">Aguardando o ADM</span>'}
    </div>`).join('');
}
$('#fin-pendentes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]');
  if (!b) return;
  const p = estado.fin.pendentes.find((x) => x.id === Number(b.dataset.pid));
  const m = membro(p.usuario_id, p.usuario_nome);
  abrirContrato({ prospeccao_id: p.id, empresa: p.empresa, usuario_nome: m.nome, usuario_papel: m.papel });
});

function renderContratos(lista) {
  $('#fin-qtd').textContent = lista.length ? `${lista.length} no período` : '';
  if (!lista.length) { $('#fin-contratos').innerHTML = '<p class="dica">Nenhum contrato neste período.</p>'; return; }
  $('#fin-contratos').innerHTML = `
    <div class="linha-fin cab-tab"><span>Empresa</span><span>Fechado por</span><span class="num">Valor</span><span class="num">Comissão</span><span class="num">${rotLucro()}</span><span class="num">Comissão paga</span></div>
    ${lista.map((c) => {
      const m = membro(c.usuario_id, c.usuario_nome);
      const [a, mm, dd] = c.fechado_em.split('-');
      return `<div class="linha-fin" data-cid="${c.id}" role="button" tabindex="0">
        <span class="nome"><strong>${esc(c.empresa)}</strong><span>${esc(c.projeto || c.nicho || 'Projeto')} · ${dd}/${mm}/${a}</span></span>
        <span class="quem quem-fin">${avatar(m, 22)}<span>${esc(c.usuario_id === estado.eu.id ? 'Você' : primeiroNome(m.nome))}</span></span>
        <span class="num dinheiro c-valor">${brl(c.valor)}</span>
        <span class="num dinheiro c-comissao">${c.modo === 'adm' ? '—' : `${brl(c.comissao)}${seloModo(c)}`}</span>
        <span class="num dinheiro c-lucro">${brl(c.lucro)}</span>
        ${c.modo === 'adm'
          ? '<span class="pago-chip" aria-hidden="true">—</span>'
          : pode('contratos')
            ? `<button type="button" class="pago-chip ${c.comissao_paga ? 'sim' : ''}" data-pagar="${c.id}" title="Clique para marcar como ${c.comissao_paga ? 'não paga' : 'paga'}">${c.comissao_paga ? 'Paga' : 'A pagar'}</button>`
            : `<span class="pago-chip ${c.comissao_paga ? 'sim' : ''}">${c.comissao_paga ? 'Paga' : 'A pagar'}</span>`}
      </div>`;
    }).join('')}`;
}
$('#fin-contratos').addEventListener('click', async (e) => {
  const pg = e.target.closest('[data-pagar]');
  if (pg) {
    const c = estado.fin.contratos.find((x) => x.id === Number(pg.dataset.pagar));
    pg.disabled = true;
    try {
      await api(`/api/contratos/${c.id}`, { method: 'PUT', body: { comissao_paga: !c.comissao_paga } });
      toast(c.comissao_paga ? 'Marcada como a pagar' : 'Comissão marcada como paga');
      await carregarFinanceiro();
    } catch (err) { toast(err.message, 'erro'); pg.disabled = false; }
    return;
  }
  const linha = e.target.closest('[data-cid]');
  if (linha) abrirContrato({ contrato_id: Number(linha.dataset.cid) });
});
$('#fin-contratos').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-cid]')) abrirContrato({ contrato_id: Number(e.target.dataset.cid) });
});

// ---------- criador de gráficos (Financeiro) ----------
const cg = Object.assign({ tipo: 'colunas', medida: 'vendido', ids: null }, lerLocal('criador-grafico') || {});
const MEDIDA = {
  vendido: { nome: 'Faturamento', fmt: brl, curto: brlCurto },
  comissao: { nome: 'Comissão', fmt: brl, curto: brlCurto },
  contratos: { nome: 'Contratos', fmt: (n) => `${n} contrato${n === 1 ? '' : 's'}`, curto: (n) => String(n) },
};
const SVG_NS = 'http://www.w3.org/2000/svg';

// dados por pessoa e por mês, a partir dos contratos do período
function dadosCriador() {
  const meses = estado.fin.porMes.map((m) => m.mes);
  const porPessoa = new Map();
  for (const c of estado.fin.contratos) {
    if (!porPessoa.has(c.usuario_id)) porPessoa.set(c.usuario_id, { id: c.usuario_id, nome: c.usuario_nome, total: 0, mes: {} });
    const p = porPessoa.get(c.usuario_id);
    const v = cg.medida === 'contratos' ? 1 : cg.medida === 'vendido' ? c.valor : c.comissao;
    p.total += v;
    const k = c.fechado_em.slice(0, 7);
    p.mes[k] = (p.mes[k] || 0) + v;
  }
  return { meses, pessoas: porPessoa };
}

function renderCriador() {
  if (!estado.fin) return;
  $$('#cg-tipos button').forEach((b) => b.classList.toggle('ativo', b.dataset.tipo === cg.tipo));
  $$('#cg-medida button').forEach((b) => b.classList.toggle('ativo', b.dataset.m === cg.medida));
  const { meses, pessoas } = dadosCriador();
  const M = MEDIDA[cg.medida];

  // lista de pessoas: quem tem contrato no período primeiro
  const todos = [...estado.equipe].sort((a, b) => (pessoas.get(b.id)?.total || 0) - (pessoas.get(a.id)?.total || 0) || a.nome.localeCompare(b.nome));
  const marcados = cg.ids === null ? todos.map((m) => m.id) : cg.ids;
  $('#cg-pessoas').innerHTML = todos.map((m) => `
    <label class="pessoa-op"><input type="checkbox" value="${m.id}" ${marcados.includes(m.id) ? 'checked' : ''}>
      <i class="cor" style="background:${corPessoa(m.id)}"></i>${avatar(m, 26)}
      <span>${esc(primeiroNome(m.nome))}${m.id === estado.eu.id ? ' (você)' : ''}</span>
      <span class="valor">${pessoas.get(m.id) ? M.curto(pessoas.get(m.id).total) : '—'}</span></label>`).join('');

  const sel = todos.filter((m) => marcados.includes(m.id))
    .map((m) => ({ ...m, total: pessoas.get(m.id)?.total || 0, mes: pessoas.get(m.id)?.mes || {}, cor: corPessoa(m.id) }));

  $('#cg-legenda').innerHTML = cg.tipo === 'pizza' || cg.tipo === 'barras' ? '' : sel.map((p) =>
    `<span><i style="background:${p.cor}"></i>${avatar(p, 22)}${esc(primeiroNome(p.nome))}</span>`).join('');

  const area = $('#cg-area');
  if (!sel.length) { area.innerHTML = '<div class="cg-vazio">Marque pelo menos uma pessoa em "Quem aparece".</div>'; return; }
  if (!meses.length || sel.every((p) => !p.total)) { area.innerHTML = '<div class="cg-vazio">Nenhum contrato dessas pessoas no período escolhido.</div>'; return; }

  if (cg.tipo === 'barras') return graficoBarras(area, sel, M);
  if (cg.tipo === 'pizza') return graficoPizza(area, sel, M);
  return graficoEixos(area, sel, meses, M, cg.tipo);
}

// colunas e linhas: eixo de meses × valor
function graficoEixos(area, sel, meses, M, tipo) {
  const largura = Math.max(area.clientWidth || 600, tipo === 'colunas' ? meses.length * (sel.length * 14 + 18) + 70 : meses.length * 46 + 70);
  const altura = 320;
  const esq = 62; const dir = 16; const cima = 16; const baixo = 34;
  const w = largura - esq - dir; const h = altura - cima - baixo;
  const max = Math.max(1, ...sel.flatMap((p) => meses.map((k) => p.mes[k] || 0)));
  const { topo, passo } = escalaBonita(max);
  const Y = (v) => cima + h - (v / topo) * h;
  const banda = w / meses.length;
  let svg = '';
  // grade e eixo Y
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    svg += `<line class="grade-linha" x1="${esq}" x2="${largura - dir}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    svg += `<text x="${esq - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(M.curto(v))}</text>`;
  }
  // rótulos dos meses (pula alguns quando são muitos)
  const pulo = Math.ceil(meses.length / Math.max(1, Math.floor(w / 44)));
  meses.forEach((k, i) => {
    if (i % pulo === 0) svg += `<text x="${esq + banda * i + banda / 2}" y="${altura - 10}" text-anchor="middle">${nomeMes(k)}</text>`;
  });
  if (tipo === 'colunas') {
    const bw = Math.min(28, (banda - 10) / sel.length);
    meses.forEach((k, i) => {
      const x0 = esq + banda * i + (banda - bw * sel.length) / 2;
      sel.forEach((p, j) => {
        const v = p.mes[k] || 0;
        if (!v) return;
        const dica = `<b>${esc(p.nome)}</b><br>${MESES_LONGO[Number(k.slice(5)) - 1]} de ${k.slice(0, 4)}: <b>${esc(M.fmt(v))}</b>`;
        svg += `<rect x="${x0 + bw * j}" y="${Y(v)}" width="${Math.max(bw - 2, 2)}" height="${Math.max(cima + h - Y(v), 1)}" rx="3" fill="${p.cor}" ${tip(dica)}/>`;
      });
    });
  } else {
    sel.forEach((p) => {
      const pts = meses.map((k, i) => [esq + banda * i + banda / 2, Y(p.mes[k] || 0), k, p.mes[k] || 0]);
      svg += `<polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="none" stroke="${p.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(([x, y, k, v]) => {
        const dica = `<b>${esc(p.nome)}</b><br>${MESES_LONGO[Number(k.slice(5)) - 1]} de ${k.slice(0, 4)}: <b>${esc(M.fmt(v))}</b>`;
        svg += `<circle cx="${x}" cy="${y}" r="9" fill="transparent" ${tip(dica)}/><circle cx="${x}" cy="${y}" r="3.5" fill="${p.cor}" pointer-events="none"/>`;
      });
      // foto (ou iniciais) no fim da linha para identificar
      const [xf, yf] = pts.at(-1);
      const id = `cg-foto-${p.id}`;
      svg += p.foto
        ? `<clipPath id="${id}"><circle cx="${xf}" cy="${yf}" r="11"/></clipPath><circle cx="${xf}" cy="${yf}" r="12.5" fill="${p.cor}"/><image href="${esc(p.foto)}" x="${xf - 11}" y="${yf - 11}" width="22" height="22" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle cx="${xf}" cy="${yf}" r="11" fill="${p.cor}"/><text x="${xf}" y="${yf + 4}" text-anchor="middle" style="fill:#fff;font-weight:700;font-size:9.5px">${esc(iniciais(p.nome))}</text>`;
    });
  }
  area.innerHTML = `<svg xmlns="${SVG_NS}" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Gráfico de ${tipo} de ${M.nome.toLowerCase()} por mês">${svg}</svg>`;
}

function graficoBarras(area, sel, M) {
  const lista = [...sel].filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...lista.map((p) => p.total));
  const soma = lista.reduce((s, p) => s + p.total, 0) || 1;
  area.innerHTML = `<div class="cg-barras">${lista.map((p) => `
    <div class="linha-b" ${tip(`<b>${esc(p.nome)}</b><br>${M.nome}: <b>${esc(M.fmt(p.total))}</b><br>${Math.round((p.total / soma) * 100)}% do total`)}>
      ${avatar(p, 40)}
      <div>
        <div class="rk-top"><strong>${esc(p.nome)}</strong><b class="dinheiro">${esc(M.fmt(p.total))}</b></div>
        <div class="trilho"><div class="barra" style="width:${(p.total / max) * 100}%;background:${p.cor}"></div></div>
      </div>
    </div>`).join('')}</div>`;
}

function graficoPizza(area, sel, M) {
  const lista = [...sel].filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
  const soma = lista.reduce((s, p) => s + p.total, 0);
  const R = 100; const r = 58; const c = 110;
  let ang = -Math.PI / 2;
  const ponto = (rad, a) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  let fatias = '';
  for (const p of lista) {
    const parte = p.total / soma;
    const dica = `<b>${esc(p.nome)}</b><br>${M.nome}: <b>${esc(M.fmt(p.total))}</b> (${Math.round(parte * 100)}%)`;
    if (parte > 0.9999) {
      fatias += `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${p.cor}" stroke-width="${R - r}" ${tip(dica)}/>`;
      break;
    }
    const fim = ang + parte * Math.PI * 2;
    const grande = parte > 0.5 ? 1 : 0;
    const [x1, y1] = ponto(R, ang); const [x2, y2] = ponto(R, fim);
    const [x3, y3] = ponto(r, fim); const [x4, y4] = ponto(r, ang);
    fatias += `<path d="M${x1},${y1} A${R},${R} 0 ${grande} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${grande} 0 ${x4},${y4} Z" fill="${p.cor}" style="stroke:var(--superficie);stroke-width:2" ${tip(dica)}/>`;
    ang = fim;
  }
  area.innerHTML = `<div class="cg-pizza">
    <svg viewBox="0 0 220 220" role="img" aria-label="Gráfico de pizza de ${M.nome.toLowerCase()} por pessoa">
      ${fatias}
      <text x="${c}" y="${c - 4}" text-anchor="middle" style="fill:var(--texto-3);font-size:11px">Total</text>
      <text x="${c}" y="${c + 16}" text-anchor="middle" style="fill:var(--texto);font-size:16px;font-weight:700">${esc(M.curto(soma))}</text>
    </svg>
    <div class="lista-pizza">${lista.map((p) => `
      <div><i style="background:${p.cor}"></i><span class="quem">${avatar(p, 26)}<span>${esc(p.nome)}</span></span>
        <b class="dinheiro">${esc(M.fmt(p.total))}</b><small>${Math.round((p.total / soma) * 100)}%</small></div>`).join('')}
    </div></div>`;
}

// selo ao lado da comissão: auto · manual · manual 15%
const seloModo = (c) => `<span class="selo-modo ${c.modo}">${c.modo === 'manual'
  ? (c.comissao_pct != null ? `manual ${fmtPct(c.comissao_pct)}%` : 'manual') : 'auto'}</span>`;

const iniciais = (nome) => (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function salvarCriador() { gravarLocal('criador-grafico', cg); renderCriador(); }
$('#cg-tipos').addEventListener('click', (e) => { const b = e.target.closest('[data-tipo]'); if (b) { cg.tipo = b.dataset.tipo; salvarCriador(); } });
$('#cg-medida').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { cg.medida = b.dataset.m; salvarCriador(); } });
$('#cg-pessoas').addEventListener('change', () => {
  cg.ids = $$('#cg-pessoas input:checked').map((i) => Number(i.value));
  salvarCriador();
});
$('#cg-todos').addEventListener('click', () => { cg.ids = null; salvarCriador(); });
$('#cg-nenhum').addEventListener('click', () => { cg.ids = []; salvarCriador(); });
// redesenha quando a largura muda (girar o celular, abrir menu)
let larguraCg = 0;
new ResizeObserver(() => {
  const w = $('#cg-area').clientWidth;
  if (w && Math.abs(w - larguraCg) > 20 && estado.fin && (cg.tipo === 'colunas' || cg.tipo === 'linhas')) { larguraCg = w; renderCriador(); }
}).observe($('#cg-area'));

// ---------- formulário de contrato ----------
let ctrAtual = null;

async function abrirContrato(info) {
  try {
    if (!estado.regra) estado.regra = await api('/api/financeiro/regra');
    ctrAtual = info.contrato_id ? await api(`/api/contratos/${info.contrato_id}`) : info;
  } catch (err) { return toast(err.message, 'erro'); }
  const c = ctrAtual;
  const f = $('#form-contrato');
  f.reset();
  $('#ctr-erro').textContent = '';
  $('#ctr-titulo').textContent = c.id ? `Contrato · ${c.empresa}` : `Novo contrato · ${c.empresa}`;
  $('#ctr-quem').textContent = `Fechado por ${quemFechou(c)}${pode('contratos') ? '' : ' · só leitura'}`;
  const adm = c.usuario_papel === 'admin';
  $('#ctr-modo').hidden = adm;
  $('#ctr-adm').hidden = !adm;
  $('#ctr-paga-campo').hidden = adm;
  f.projeto.value = c.projeto || '';
  f.valor.value = c.valor != null ? fmtValor(c.valor) : '';
  f.fechado_em.value = c.fechado_em || hojeISO();
  const temPct = c.comissao_pct !== null && c.comissao_pct !== undefined;
  const temValor = c.comissao_manual !== null && c.comissao_manual !== undefined;
  f.modo.value = temPct || temValor ? 'manual' : 'auto';
  ctrUnidade = temPct ? 'pct' : 'valor';
  f.comissao_manual.value = temPct ? fmtPct(c.comissao_pct) : temValor ? fmtValor(c.comissao_manual) : '';
  f.comissao_paga.checked = Boolean(c.comissao_paga);
  $('#ctr-excluir').hidden = !c.id || !pode('contratos');
  // gerente sem permissão: vê o contrato, mas não muda nada
  const leitura = !pode('contratos');
  $$('input, select, textarea, #ctr-unidade button, .divisao button, button.primario', f).forEach((el) => (el.disabled = leitura));
  f.classList.toggle('so-leitura', leitura);
  atualizarCalculo();
  $('#dlg-contrato').showModal();
  setTimeout(() => (c.id ? f.projeto : f.valor).focus(), 50);
}

// ---- comissão manual em R$ ou em % ----
let ctrUnidade = 'valor';
// lê o campo manual: "150", "150,00" → valor · "15%" (ou botão % marcado) → porcentagem
function lerManual() {
  const f = $('#form-contrato');
  const bruto = f.comissao_manual.value.trim();
  const temSinal = bruto.includes('%');
  if (temSinal && ctrUnidade !== 'pct') { ctrUnidade = 'pct'; marcarUnidade(); }
  const n = lerValor(bruto.replace('%', ''));
  if (ctrUnidade === 'pct') return { tipo: 'pct', n, ok: n !== null && !Number.isNaN(n) && n <= 100 };
  return { tipo: 'valor', n, ok: n !== null && !Number.isNaN(n) };
}
function marcarUnidade() {
  $$('#ctr-unidade button').forEach((b) => b.classList.toggle('ativo', b.dataset.u === ctrUnidade));
  $('#ctr-manual').placeholder = ctrUnidade === 'pct' ? 'Ex.: 15 (vira 15% do valor do projeto)' : 'Ex.: 150,00 ou 15%';
}
$('#ctr-unidade').addEventListener('click', (e) => {
  const b = e.target.closest('[data-u]');
  if (!b) return;
  const f = $('#form-contrato');
  ctrUnidade = b.dataset.u;
  if (ctrUnidade === 'valor') f.comissao_manual.value = f.comissao_manual.value.replace('%', '').trim();
  marcarUnidade();
  atualizarCalculo();
  f.comissao_manual.focus();
});

function atualizarCalculo() {
  const f = $('#form-contrato');
  const r = estado.regra;
  const valor = lerValor(f.valor.value);
  const valido = valor !== null && !Number.isNaN(valor);
  const adm = ctrAtual?.usuario_papel === 'admin';
  const manual = f.modo.value === 'manual';
  // contrato já salvo e valor igual: usa a comissão guardada no registro
  const guardada = ctrAtual?.id && valor === ctrAtual.valor && ctrAtual.comissao_auto != null;
  const auto = valido ? (guardada ? ctrAtual.comissao_auto : comissaoAuto(valor, r)) : null;

  $('#ctr-auto').textContent = auto === null ? '' : brl(auto);
  $('#ctr-regra').textContent = `${brl(r.fixa)} fixo + ${fmtPct(r.percentual)}% do valor do projeto`;
  $('#ctr-manual-linha').hidden = !manual || adm;
  marcarUnidade();

  let com = 0;
  const dica = $('#ctr-manual-dica');
  dica.hidden = true;
  if (!adm && manual) {
    const m = lerManual();
    if (m.tipo === 'pct') {
      com = m.ok && valido ? centavos((valor * m.n) / 100) : NaN;
      if (m.ok && valido) { dica.textContent = `${fmtPct(m.n)}% de ${brl(valor)} = ${brl(com)}. Se o valor do projeto mudar, a comissão acompanha.`; dica.hidden = false; }
      else if (m.n > 100) { dica.textContent = 'A porcentagem vai até 100%.'; dica.hidden = false; }
    } else {
      com = m.ok ? m.n : NaN;
      if (m.ok && valido && valor > 0) { dica.textContent = `Equivale a ${fmtPct(Math.round((m.n / valor) * 1000) / 10)}% do valor do projeto.`; dica.hidden = false; }
    }
  } else if (!adm) {
    com = auto;
  }
  const comOk = com !== null && !Number.isNaN(com);

  $('#ctr-divisao').innerHTML = valido ? `
    <div class="voce"><span>${ehAdmin() ? 'Você recebe' : 'A empresa fica com'}</span><strong>${comOk ? brl(valor - com) : '—'}</strong></div>
    ${adm
      ? `<div><span>Comissão</span><strong>${brl(0)}</strong></div>`
      : `<button type="button" class="editavel" id="ctr-editar-com" title="Editar quanto o funcionário recebe" ${pode('contratos') ? '' : 'disabled'}>
          <span>Funcionário recebe</span><strong>${comOk ? brl(com) : '—'}</strong>
          <i class="lapis" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></i>
        </button>`}` : '';
}
$('#form-contrato').addEventListener('input', atualizarCalculo);
$('#form-contrato').addEventListener('change', (e) => {
  atualizarCalculo();
  if (e.target.name === 'modo' && e.target.value === 'manual') $('#ctr-manual').focus();
});
// atalho: o lápis em "Funcionário recebe" passa para "Eu defino o valor" já com o valor atual
$('#ctr-divisao').addEventListener('click', (e) => {
  if (!e.target.closest('#ctr-editar-com') || !pode('contratos')) return;
  const f = $('#form-contrato');
  if (f.modo.value !== 'manual') {
    const atual = $('#ctr-editar-com strong').textContent;
    f.modo.value = 'manual';
    ctrUnidade = 'valor';
    f.comissao_manual.value = atual === '—' ? '' : atual.replace(/[R$\s]/g, '');
  }
  atualizarCalculo();
  const campo = $('#ctr-manual');
  campo.focus();
  campo.select();
});

$('#form-contrato').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const c = ctrAtual;
  const adm = c.usuario_papel === 'admin';
  const valor = lerValor(f.valor.value);
  if (valor === null || Number.isNaN(valor)) { $('#ctr-erro').textContent = 'Coloque o valor do projeto (ex.: 450,00).'; return; }
  let manual = null;
  if (!adm && f.modo.value === 'manual') {
    const m = lerManual();
    if (!m.ok) {
      $('#ctr-erro').textContent = m.tipo === 'pct'
        ? 'Coloque a porcentagem da comissão (de 0 a 100).'
        : 'Coloque quanto o funcionário vai receber (ex.: 150,00 ou 15%).';
      return;
    }
    // vai para o servidor como "15%" ou como valor em reais
    manual = m.tipo === 'pct' ? `${String(m.n).replace('.', ',')}%` : m.n;
  }
  const corpo = {
    projeto: f.projeto.value, valor, fechado_em: f.fechado_em.value,
    comissao_manual: manual, comissao_paga: !adm && f.comissao_paga.checked,
  };
  try {
    if (c.id) await api(`/api/contratos/${c.id}`, { method: 'PUT', body: corpo });
    else await api('/api/contratos', { method: 'POST', body: { ...corpo, prospeccao_id: c.prospeccao_id } });
    $('#dlg-contrato').close();
    toast(c.id ? 'Contrato atualizado' : 'Contrato registrado!');
    atualizarTelaAtual();
  } catch (err) { $('#ctr-erro').textContent = err.message; }
});

$('#ctr-excluir').addEventListener('click', async () => {
  if (!confirm(`Excluir o contrato de “${ctrAtual.empresa}”? A prospecção continua salva.`)) return;
  try {
    await api(`/api/contratos/${ctrAtual.id}`, { method: 'DELETE' });
    $('#dlg-contrato').close();
    toast('Contrato excluído');
    atualizarTelaAtual();
  } catch (err) { toast(err.message, 'erro'); }
});

function atualizarTelaAtual() {
  const v = location.hash.slice(1) || 'prospeccoes';
  const pega = (err) => toast(err.message, 'erro');
  if (v === 'financeiro') carregarFinanceiro().catch(pega);
  else if (v === 'observacoes') carregarObs().catch(pega);
  else if (v === 'painel') carregarPainel().catch(pega);
  else if (v === 'nichos') carregarNichos().catch(pega);
  else if (v === 'equipe') carregarUsuarios().catch(pega);
  else if (v === 'prospeccoes') carregarProsp().catch(pega);
}

// =====================================================
//  PERFIL
// =====================================================
async function renderPerfil() {
  $('#perfil-avatar').innerHTML = avatar(estado.eu, 72);
  $('#perfil-nome').innerHTML = esc(estado.eu.nome) + selo(estado.eu);
  $('#perfil-login').textContent = `login: ${estado.eu.login} · ${NOME_CARGO[estado.eu.papel]}${estado.eu.verificado ? ' · verificado' : ''}`;
  $('#btn-remover-foto').hidden = !estado.eu.foto;
  marcarTema(temaSalvo());
  if (document.activeElement?.form !== $('#form-marca')) $('#form-marca').nome.value = estado.nomeSistema || '';
  await renderGanhos();
}

// ---------- nome do sistema (logo HostQuest + nome que o ADM escolhe) ----------
function aplicarMarca(nome) {
  estado.nomeSistema = nome;
  $$('.nome-sistema').forEach((el) => (el.textContent = nome));
  document.title = nome;
  try { localStorage.setItem('nome-sistema', nome); } catch { /* sem armazenamento */ }
}
// mostra o último nome conhecido na hora, sem esperar o servidor
try { const salvo = localStorage.getItem('nome-sistema'); if (salvo) aplicarMarca(salvo); } catch { /* ignora */ }
fetch('/api/marca').then((r) => r.json()).then((d) => d?.nome && aplicarMarca(d.nome)).catch(() => {});

$('#form-marca').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const d = await api('/api/marca', { method: 'PUT', body: { nome: e.target.nome.value } });
    aplicarMarca(d.nome);
    toast(`Nome do sistema: ${d.nome}`);
  } catch (err) { toast(err.message, 'erro'); }
});

// "Meus ganhos" no Perfil: só o resumo (a lista completa fica na aba Meus ganhos)
async function renderGanhos() {
  const el = $('#meus-ganhos');
  if (estado.eu.papel === 'admin') { el.hidden = true; return; }
  let d;
  try { d = await api('/api/me/ganhos'); } catch { el.hidden = true; return; }
  if (!d.contratos.length) { el.hidden = true; return; }
  el.innerHTML = `
    <h4>Meus ganhos</h4>
    <p class="dica">Comissão dos contratos que você fechou.</p>
    ${cartoesGanhos(d.totais)}
    <a class="btn pequeno" href="#ganhos">Ver todos os contratos</a>`;
  el.hidden = false;
}

const cartoesGanhos = (t) => `
  <div class="func-dinheiro">
    <div class="forte"><span>A receber</span><strong class="dinheiro">${brl(t.aPagar)}</strong></div>
    <div><span>Já recebido</span><strong class="dinheiro">${brl(t.pago)}</strong></div>
    <div><span>Total de comissões</span><strong class="dinheiro">${brl(t.comissao)}</strong></div>
  </div>`;

// =====================================================
//  ABA MEUS GANHOS (funcionário)
// =====================================================
// nos ganhos, o padrão é ver tudo (todos os anos)
if (!lerLocal('periodo-ganhos')) gravarLocal('periodo-ganhos', { ano: 'todos', mes: 0, modo: 'mes', de: '', ate: '' });
const filtroGanhos = criarFiltro($('#fp-ganhos'), 'ganhos', () => carregarGanhos().catch((err) => toast(err.message, 'erro')));
const gan = { lista: [], status: '', limite: 20 };

async function carregarGanhos() {
  filtroGanhos.desenhar();
  const d = await api('/api/me/ganhos?' + filtroGanhos.query());
  gan.lista = d.contratos;
  gan.limite = 20;
  const t = d.totais || { contratos: 0, comissao: 0, pago: 0, aPagar: 0 };
  $('#gan-kpis').innerHTML = `
    <div class="kpi destaque-laranja"><span><i class="s-pensando"></i>A receber</span><strong class="dinheiro">${brl(t.aPagar)}</strong><small>${gan.lista.filter((c) => !c.comissao_paga).length} contrato(s)</small></div>
    <div class="kpi"><span><i class="s-aceitou"></i>Já recebido</span><strong class="dinheiro">${brl(t.pago)}</strong><small>${gan.lista.filter((c) => c.comissao_paga).length} contrato(s)</small></div>
    <div class="kpi"><span>Total de comissões</span><strong class="dinheiro">${brl(t.comissao)}</strong><small>${esc(filtroGanhos.rotulo())}</small></div>
    <div class="kpi"><span>Contratos fechados</span><strong>${t.contratos}</strong><small>média de ${brl(t.contratos ? t.comissao / t.contratos : 0)} cada</small></div>`;
  renderGanhosMeses();
  renderGanhosLista();
}

function renderGanhosMeses() {
  const el = $('#gan-meses');
  if (!gan.lista.length) { el.innerHTML = '<p class="dica">Nenhum contrato registrado neste período.</p>'; return; }
  // meses seguidos do primeiro ao último contrato do período
  const mapa = {};
  for (const c of gan.lista) {
    const k = c.fechado_em.slice(0, 7);
    mapa[k] = mapa[k] || { rec: 0, are: 0, n: 0 };
    mapa[k][c.comissao_paga ? 'rec' : 'are'] += c.comissao;
    mapa[k].n += 1;
  }
  const chaves = Object.keys(mapa).sort();
  const meses = [];
  let [a, m] = chaves[0].split('-').map(Number);
  const [fa, fm] = chaves.at(-1).split('-').map(Number);
  while (a < fa || (a === fa && m <= fm)) {
    const k = `${a}-${String(m).padStart(2, '0')}`;
    meses.push({ k, ...(mapa[k] || { rec: 0, are: 0, n: 0 }) });
    m += 1; if (m > 12) { m = 1; a += 1; }
  }
  const max = Math.max(1, ...meses.map((x) => x.rec + x.are));
  el.innerHTML = `<div class="rolagem-x"><div class="meses" style="min-width:${meses.length * 34}px">${meses.map((x) => {
    const tot = x.rec + x.are;
    const [aa, mm] = x.k.split('-');
    const dica = `<b>${MESES_LONGO[Number(mm) - 1]} de ${aa}</b><br>`
      + `<span class="linha-dica"><span>Recebido</span><b>${brl(x.rec)}</b></span>`
      + `<span class="linha-dica"><span>A receber</span><b>${brl(x.are)}</b></span>`
      + `<span class="linha-dica"><span>Contratos</span><b>${x.n}</b></span>`;
    return `<div class="mes ${tot ? '' : 'mes-vazio'}" ${tip(dica)}>
      <span class="mes-valor">${tot ? brlCurto(tot).replace('R$ ', '') : ''}</span>
      <div class="mes-coluna" style="height:${(tot / max) * 78}%">${tot ? `<i class="s-aceitou" style="height:${(x.rec / tot) * 100}%"></i><i class="s-pensando" style="height:${(x.are / tot) * 100}%"></i>` : ''}</div>
      <span class="mes-nome">${nomeMes(x.k)}</span></div>`;
  }).join('')}</div></div>`;
}

function renderGanhosLista() {
  $$('#gan-status button').forEach((b) => b.classList.toggle('ativo', b.dataset.s === gan.status));
  const q = semAcento($('#gan-busca').value);
  const filtrada = gan.lista.filter((c) =>
    (!gan.status || (gan.status === 'recebido') === Boolean(c.comissao_paga))
    && (!q || semAcento(`${c.empresa} ${c.projeto || ''}`).includes(q)));
  const soma = filtrada.reduce((s, c) => s + c.comissao, 0);
  $('#gan-qtd').textContent = filtrada.length ? `${filtrada.length} contrato${filtrada.length === 1 ? '' : 's'} · ${brl(soma)}` : '';
  const visiveis = filtrada.slice(0, gan.limite);
  $('#gan-lista').innerHTML = filtrada.length ? `
    <div class="linha-gan cab-tab"><span>Empresa</span><span>Fechado em</span><span class="num">Comissão</span><span class="num">Situação</span></div>
    ${visiveis.map((c) => `
      <div class="linha-gan">
        <span class="nome"><strong>${esc(c.empresa)}</strong>${c.projeto ? `<span>${esc(c.projeto)}</span>` : ''}</span>
        <span class="data">${dataBr(c.fechado_em)}</span>
        <span class="num dinheiro"><b>${brl(c.comissao)}</b></span>
        <span class="num"><span class="chip ${c.comissao_paga ? 'aceitou' : 'pensando'}">${c.comissao_paga ? 'Recebido' : 'A receber'}</span></span>
      </div>`).join('')}`
    : '<div class="vazio"><strong>Nada encontrado</strong>Mude a busca, a situação ou o período.</div>';
  const resto = filtrada.length - visiveis.length;
  $('#gan-mais').hidden = resto <= 0;
  $('#gan-mais').textContent = `Mostrar mais (${resto} restante${resto === 1 ? '' : 's'})`;
}
$('#gan-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-s]');
  if (b) { gan.status = b.dataset.s; gan.limite = 20; renderGanhosLista(); }
});
$('#gan-busca').addEventListener('input', () => { gan.limite = 20; renderGanhosLista(); });
$('#gan-mais').addEventListener('click', () => { gan.limite += 20; renderGanhosLista(); });

// ---------- tema claro / escuro (salvo neste aparelho) ----------
function temaSalvo() {
  try { return localStorage.getItem('tema') || 'auto'; } catch { return 'auto'; }
}
function marcarTema(t) {
  $$('#tema button').forEach((b) => b.classList.toggle('ativo', b.dataset.tema === t));
}
function aplicarTema(t) {
  const raiz = document.documentElement;
  if (t === 'claro') raiz.dataset.theme = 'light';
  else if (t === 'escuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
  try {
    if (t === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', t);
  } catch { /* navegador sem armazenamento: vale só até recarregar */ }
  marcarTema(t);
}
$('#tema').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) aplicarTema(b.dataset.tema);
});

// Corta a foto em quadrado e reduz para 256px (fica leve no banco)
function reduzirFoto(file) {
  return new Promise((ok, falhou) => {
    const img = new Image();
    img.onload = () => {
      const T = 256;
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = T;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, T, T);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => falhou(new Error('Não consegui abrir essa imagem.'));
    img.src = URL.createObjectURL(file);
  });
}

async function salvarFoto(foto) {
  await api('/api/me/foto', { method: 'PUT', body: { foto } });
  estado.eu.foto = foto;
  const m = estado.equipe.find((x) => x.id === estado.eu.id);
  if (m) m.foto = foto;
  renderEu();
  renderPerfil();
}

$('#in-foto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await salvarFoto(await reduzirFoto(file));
    toast('Foto atualizada');
  } catch (err) { toast(err.message, 'erro'); }
});

$('#btn-remover-foto').addEventListener('click', async () => {
  try {
    await salvarFoto(null);
    toast('Foto removida');
  } catch (err) { toast(err.message, 'erro'); }
});

$('#form-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/me/senha', { method: 'PUT', body: { atual: f.atual.value, nova: f.nova.value } });
    f.reset();
    toast('Senha alterada');
  } catch (err) { toast(err.message, 'erro'); }
});

$('#btn-sair').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  estado.eu = null;
  location.hash = '';
  mostrarLogin();
});

// =====================================================
//  INÍCIO
// =====================================================
(async () => {
  try {
    estado.eu = await api('/api/me');
    await entrarApp();
  } catch {
    mostrarLogin();
  }
})();
