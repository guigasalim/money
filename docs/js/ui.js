// Interface. Tudo que toca o DOM mora aqui; calculo fica em budget.js e
// persistencia em store.js.
//
// Texto vindo do usuario sempre entra por textContent. Nada de innerHTML com
// dado digitado -- o token do GitHub vive neste mesmo localStorage.

import * as B from './budget.js';
import * as S from './store.js';
import { sincronizar, testarConexao, ErroSync } from './sync-github.js';

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];

function el(tag, attrs = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'texto') n.textContent = v;
    else if (k === 'estilo') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of [].concat(filhos)) if (f) n.append(f);
  return n;
}

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const brl = B.brl;
const corDe = (cat) => `var(--sp-${(cat && cat.cor) || 'azul'})`;

// ---------------------------------------------------------------- estado

let estado = S.carregar();
let mesVisivel = B.ymHoje();
let telaAtual = 'hoje';
let sincronizando = false;
let timerSync = null;

const cat = (id) => estado.categorias.find((c) => c.id === id);
const catsAtivas = () => B.vivos(estado.categorias).filter((c) => !c.arquivada);

function persistir({ resync = true } = {}) {
  S.salvar(estado);
  render();
  if (resync) agendarSync();
}

// ---------------------------------------------------------------- avisos

let timerTorrada = null;
function torrada(msg) {
  const t = q('#torrada');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(timerTorrada);
  timerTorrada = setTimeout(() => { t.hidden = true; }, 2800);
}

function caixaAviso(texto, tom = '') {
  return el('div', { class: `aviso ${tom}`.trim(), texto });
}

// ---------------------------------------------------------------- tema

function aplicarTema() {
  const t = localStorage.getItem('money.tema') || 'sistema';
  if (t === 'sistema') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

q('#btn-tema').addEventListener('click', () => {
  const ordem = ['sistema', 'escuro', 'claro'];
  const atual = localStorage.getItem('money.tema') || 'sistema';
  const prox = ordem[(ordem.indexOf(atual) + 1) % 3];
  localStorage.setItem('money.tema', prox === 'escuro' ? 'dark' : prox === 'claro' ? 'light' : 'sistema');
  aplicarTema();
  torrada(`Tema: ${prox}`);
});

// ---------------------------------------------------------------- som
// A faixa abre com um loop de caixa registradora. Aqui e so um clique curto
// sintetizado -- sem arquivo, funciona offline. Desligado por padrao.

function tocarRegistro() {
  if (localStorage.getItem('money.som') !== '1') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const agora = ctx.currentTime;
    for (const [t, freq, dur, vol] of [[0, 1850, .045, .17], [.055, 1400, .05, .13], [.12, 2600, .13, .1]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(vol, agora + t);
      g.gain.exponentialRampToValueAtTime(0.0001, agora + t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(agora + t);
      osc.stop(agora + t + dur);
    }
    setTimeout(() => ctx.close(), 500);
  } catch { /* sem audio disponivel: seguir em silencio */ }
}

// ---------------------------------------------------------------- navegacao

const TITULOS = {
  hoje: 'Hoje', envelopes: 'Envelopes', extrato: 'Extrato',
  plano: 'Plano', ajustes: 'Ajustes', onboarding: 'Comecar',
};

function irPara(tela) {
  telaAtual = tela;
  qa('.tela').forEach((s) => s.classList.toggle('ativa', s.id === `tela-${tela}`));
  qa('.nav button[data-tela]').forEach((b) => {
    if (b.dataset.tela === tela) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

qa('.nav button[data-tela]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tela)));
q('#btn-ajustes').addEventListener('click', () => irPara('ajustes'));

// ---------------------------------------------------------------- prisma

const PRISMA = { ex: 191.6, ey: 86, x2: 356, y0: 22, h: 120 };
const ORDEM_ESPECTRO = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'violeta'];

function renderPrisma(r) {
  const g = q('#prisma-bandas');
  const legenda = q('#prisma-legenda');
  g.textContent = '';
  legenda.textContent = '';

  const fatias = [];
  for (const e of r.porCategoria) {
    const total = e.gasto + e.comprometido;
    if (total <= 0) continue;
    fatias.push({ nome: e.nome, valor: total, cor: cat(e.categoriaId)?.cor || 'azul' });
  }
  if (r.meta > 0) fatias.push({ nome: 'Poupanca', valor: r.meta, cor: 'violeta' });
  if (r.livre > 0) fatias.push({ nome: 'Ainda livre', valor: r.livre, cor: 'branco' });

  const soma = fatias.reduce((s, f) => s + f.valor, 0);
  if (soma <= 0) {
    legenda.append(el('span', { texto: 'Informe a renda no Plano e o prisma mostra a divisao do mes.' }));
    return;
  }

  fatias.sort((a, b) => ORDEM_ESPECTRO.indexOf(a.cor) - ORDEM_ESPECTRO.indexOf(b.cor) || b.valor - a.valor);

  let y = PRISMA.y0;
  for (const f of fatias) {
    const alt = (f.valor / soma) * PRISMA.h;
    const p = svg('polygon', {
      points: `${PRISMA.ex},${PRISMA.ey - 1.2} ${PRISMA.x2},${y.toFixed(1)} ${PRISMA.x2},${(y + alt).toFixed(1)} ${PRISMA.ex},${PRISMA.ey + 1.2}`,
      opacity: '0.92',
    });
    p.style.fill = f.cor === 'branco' ? '#f2f0eb' : corDe({ cor: f.cor });
    if (f.cor === 'branco') p.setAttribute('opacity', '0.22');
    g.append(p);
    y += alt;
  }

  for (const f of [...fatias].sort((a, b) => b.valor - a.valor).slice(0, 5)) {
    const pct = Math.round((f.valor / soma) * 100);
    const ponto = el('i');
    ponto.style.background = f.cor === 'branco' ? '#f2f0eb' : corDe({ cor: f.cor });
    legenda.append(el('span', {}, [ponto, el('span', { texto: `${f.nome} ${pct}%` })]));
  }
}

// ---------------------------------------------------------------- tela hoje

function renderHoje() {
  const r = B.resumo(estado, B.ymHoje());

  const painel = q('#painel-dia');
  const valor = q('#painel-valor');
  valor.textContent = brl(r.porDia);
  valor.classList.toggle('negativo', r.porDia < 0);

  let nota;
  if (r.renda <= 0) nota = 'Informe seu salario em Plano para o calculo comecar.';
  else if (r.livre < 0) nota = `Voce ja passou ${brl(-r.livre)} do variavel deste mes.`;
  else if (r.diasRestantes <= 0) nota = 'Mes encerrado.';
  else nota = `${brl(r.livre)} divididos por ${r.diasRestantes} ${r.diasRestantes === 1 ? 'dia' : 'dias'}.`;
  q('#painel-nota').textContent = nota;

  q('#painel-livre').textContent = brl(r.livre);
  q('#painel-gasto').textContent = brl(r.gasto);
  q('#painel-dias').textContent = String(r.diasRestantes);
  painel.classList.toggle('vazio', false);

  renderPrisma(r);

  // alertas
  const alertas = q('#alertas-hoje');
  alertas.textContent = '';
  if (r.renda > 0 && r.comprometidoPct > 0.6) {
    alertas.append(caixaAviso(
      `Fixos e parcelas consomem ${Math.round(r.comprometidoPct * 100)}% da renda. Acima de 60% sobra pouco para absorver imprevisto.`, ''));
  }
  if (r.ritmo > 1.15 && r.gasto > 0 && r.diasRestantes > 0) {
    alertas.append(caixaAviso(
      `Ritmo acima do planejado: ja gastou ${brl(r.gasto)} onde o proporcional ao dia seria ${brl(r.esperado)}.`, ''));
  }
  const estourados = r.porCategoria.filter((e) => e.estouro);
  if (estourados.length) {
    alertas.append(caixaAviso(
      `${estourados.length} ${estourados.length === 1 ? 'envelope estourado' : 'envelopes estourados'}: ${estourados.map((e) => e.nome.split('—')[0].trim()).join(', ')}.`, 'ruim'));
  }
  if (S.temPendencia() && estado.sync.repo) {
    alertas.append(caixaAviso('Ha alteracoes ainda nao enviadas para o repositorio.', ''));
  }

  // baldes
  const baldes = q('#baldes');
  baldes.textContent = '';
  const corBalde = { essencial: 'azul', qualidade: 'laranja', futuro: 'violeta' };
  for (const b of Object.values(r.baldes)) {
    const pct = Math.round(b.pctRenda * 100);
    const alvo = Math.round(b.alvo * 100);
    const acima = pct > alvo + 5;
    baldes.append(el('div', { class: 'balde', estilo: { borderTopColor: `var(--sp-${corBalde[b.id]})` } }, [
      el('div', { class: 'n', texto: b.nome }),
      el('div', { class: 'v num', texto: brl(b.total) }),
      el('span', { class: `pill ${acima ? 'atencao' : 'bom'}`, texto: `${pct}% · alvo ${alvo}%` }),
    ]));
  }

  // envelopes com menos folga
  const risco = q('#envelopes-risco');
  risco.textContent = '';
  const comLimite = r.porCategoria
    .filter((e) => e.tipo === 'variavel' && e.envelope > 0)
    .sort((a, b) => (a.envelope - a.gasto) / a.envelope - (b.envelope - b.gasto) / b.envelope)
    .slice(0, 4);
  if (!comLimite.length) {
    risco.append(el('p', { class: 'vazio', texto: 'Nenhum limite definido ainda.' },
      [el('em', { texto: 'Abra Envelopes e toque em Propor limites.' })]));
  } else {
    for (const e of comLimite) risco.append(linhaEnvelope(e, false));
  }

  // ultimos lancamentos
  const ultimos = q('#ultimos');
  ultimos.textContent = '';
  const lista = B.vivos(estado.lancamentos)
    .sort((a, b) => (b.data + b.updatedAt).localeCompare(a.data + a.updatedAt)).slice(0, 6);
  if (!lista.length) {
    ultimos.append(el('p', { class: 'vazio', texto: 'Nada lancado ainda.' },
      [el('em', { texto: 'Toque no + para registrar o primeiro gasto.' })]));
  } else {
    for (const l of lista) ultimos.append(linhaLancamento(l, true));
  }
}

// ---------------------------------------------------------------- linhas

function linhaEnvelope(e, editavel = true) {
  const c = cat(e.categoriaId);
  const pct = Math.min(1, Math.max(0, e.pct));
  const faixa = el('span', { class: 'faixa' });
  faixa.style.background = corDe(c);
  const barra = el('div', { class: `barra${e.estouro ? ' estouro' : ''}` }, [el('i')]);
  barra.firstChild.style.width = `${pct * 100}%`;
  if (!e.estouro) barra.firstChild.style.background = corDe(c);

  const detalhe = e.envelope > 0
    ? `${brl(e.gasto)} de ${brl(e.envelope)}`
    : `${brl(e.gasto)} · sem limite`;

  const no = el(editavel ? 'button' : 'div', {
    class: `envelope${e.estouro ? ' estourado' : ''}`,
    ...(editavel ? { type: 'button', onclick: () => pedirLimite(e) } : {}),
  }, [
    faixa,
    el('span', { class: 'ic', texto: e.icone }),
    el('span', {}, [
      el('div', { class: 'nome', texto: e.nome }),
      el('div', { class: 'det', texto: detalhe }),
    ]),
    el('span', { class: 'cifra', texto: e.envelope > 0 ? brl(e.restante) : brl(e.gasto) },
      [el('small', { texto: e.envelope > 0 ? (e.restante < 0 ? 'estourado' : 'restam') : `${e.lancamentos} lanc.` })]),
    barra,
  ]);
  return no;
}

function linhaLancamento(l, compacto = false) {
  const c = cat(l.categoriaId);
  const faixa = el('span', { class: 'faixa' });
  faixa.style.background = corDe(c);
  const receita = l.tipo === 'receita';
  const sub = [l.descricao, compacto ? formatarDiaCurto(l.data) : l.formaPagamento]
    .filter(Boolean).join(' · ');
  return el('button', {
    class: 'lanc', type: 'button',
    onclick: () => abrirFolha({ editar: l.id }),
  }, [
    faixa,
    el('span', { class: 'ic', texto: c ? c.icone : '•' }),
    el('span', {}, [
      el('div', { class: 't', texto: c ? c.nome.split('—')[0].trim() : 'Sem categoria' }),
      el('div', { class: 's', texto: sub || (receita ? 'entrada' : 'gasto') }),
    ]),
    el('span', { class: `v${receita ? ' receita' : ''}`, texto: (receita ? '+' : '') + brl(l.valor) }),
  ]);
}

function formatarDiaCurto(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ---------------------------------------------------------------- envelopes

function pedirLimite(e) {
  const atual = e.envelope || 0;
  const entrada = prompt(`Limite mensal para ${e.nome}\n(0 para deixar sem limite)`, String(atual));
  if (entrada == null) return;
  const v = Number(String(entrada).replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) { torrada('Valor invalido.'); return; }
  S.definirLimite(estado, e.categoriaId, v);
  persistir();
  torrada('Limite atualizado.');
}

function renderEnvelopes() {
  const r = B.resumo(estado, B.ymHoje());
  q('#env-disponivel').textContent = brl(r.disponivel);

  const aviso = q('#env-sobra-aviso');
  aviso.textContent = '';
  const somaEnv = r.porCategoria.filter((e) => e.tipo === 'variavel')
    .reduce((s, e) => s + e.envelope, 0);
  const dif = B.cent(r.disponivel - somaEnv);
  if (somaEnv === 0) {
    aviso.append(caixaAviso('Nenhum limite definido. Toque em Propor limites para uma primeira divisao baseada na sua renda.', ''));
  } else if (Math.abs(dif) >= 1) {
    aviso.append(caixaAviso(
      dif > 0
        ? `Os envelopes somam ${brl(somaEnv)} — sobram ${brl(dif)} sem destino.`
        : `Os envelopes somam ${brl(somaEnv)}, ${brl(-dif)} acima do dinheiro variavel do mes.`,
      dif > 0 ? '' : 'ruim'));
  } else {
    aviso.append(caixaAviso('Envelopes fecham com o dinheiro variavel do mes.', 'ok'));
  }

  for (const [alvo, filtro] of [
    ['#env-essencial', (e) => e.tipo === 'variavel' && e.balde === 'essencial'],
    ['#env-qualidade', (e) => e.tipo === 'variavel' && e.balde === 'qualidade'],
  ]) {
    const no = q(alvo);
    no.textContent = '';
    const itens = r.porCategoria.filter(filtro).sort((a, b) => b.envelope - a.envelope || a.nome.localeCompare(b.nome));
    for (const e of itens) no.append(linhaEnvelope(e, true));
  }

  const fixos = q('#env-fixos');
  fixos.textContent = '';
  const comprometidos = r.porCategoria.filter((e) => e.comprometido > 0);
  if (!comprometidos.length) {
    fixos.append(el('p', { class: 'vazio', texto: 'Nenhuma conta fixa ou parcela cadastrada.' }));
  } else {
    for (const e of comprometidos) {
      const c = cat(e.categoriaId);
      const faixa = el('span', { class: 'faixa' });
      faixa.style.background = corDe(c);
      fixos.append(el('div', { class: 'envelope' }, [
        faixa,
        el('span', { class: 'ic', texto: e.icone }),
        el('span', {}, [el('div', { class: 'nome', texto: e.nome }),
          el('div', { class: 'det', texto: 'ja descontado do calculo' })]),
        el('span', { class: 'cifra', texto: brl(e.comprometido) }),
      ]));
    }
  }
}

q('#btn-propor').addEventListener('click', () => {
  const { sugestao, resumo: r, alerta } = B.sugerirEnvelopes(estado, B.ymHoje());
  if (r.renda <= 0) { torrada('Informe seu salario em Plano primeiro.'); return; }
  const linhas = Object.entries(sugestao)
    .map(([id, v]) => `  ${cat(id)?.nome.split('—')[0].trim()}: ${brl(v)}`).join('\n');
  if (!confirm(`Proposta para ${brl(r.disponivel)} de dinheiro variavel:\n\n${linhas}\n\nAplicar? Voce pode ajustar cada um depois.`)) return;
  for (const [id, v] of Object.entries(sugestao)) S.definirLimite(estado, id, v);
  persistir();
  torrada('Limites aplicados.');
  if (alerta) setTimeout(() => alert(alerta), 300);
});

// ---------------------------------------------------------------- extrato

function renderExtrato() {
  q('#mes-rotulo').textContent = B.rotuloMes(mesVisivel);
  const lista = q('#extrato-lista');
  lista.textContent = '';

  const itens = B.lancamentosDoMes(estado, mesVisivel)
    .sort((a, b) => b.data.localeCompare(a.data) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  if (!itens.length) {
    lista.append(el('p', { class: 'vazio', texto: 'Nenhum lancamento neste mes.' }));
    return;
  }

  const porDia = new Map();
  for (const l of itens) {
    if (!porDia.has(l.data)) porDia.set(l.data, []);
    porDia.get(l.data).push(l);
  }
  for (const [data, doDia] of porDia) {
    const soma = doDia.reduce((s, l) => s + (l.tipo === 'receita' ? -l.valor : l.valor), 0);
    lista.append(el('div', { class: 'dia-cab' }, [
      el('span', { texto: rotuloDia(data) }),
      el('span', { class: 'soma', texto: brl(soma) }),
    ]));
    for (const l of doDia) lista.append(linhaLancamento(l));
  }
}

function rotuloDia(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  const semana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][data.getDay()];
  if (iso === B.hojeISO()) return `hoje · ${d}/${String(m).padStart(2, '0')}`;
  return `${semana} · ${d}/${String(m).padStart(2, '0')}`;
}

q('#mes-ant').addEventListener('click', () => { mesVisivel = B.somaMeses(mesVisivel, -1); render(); });
q('#mes-prox').addEventListener('click', () => { mesVisivel = B.somaMeses(mesVisivel, 1); render(); });

// ---------------------------------------------------------------- plano

function preencherSelectCategorias(sel, filtro) {
  sel.textContent = '';
  for (const c of catsAtivas().filter(filtro)) {
    sel.append(el('option', { value: c.id, texto: `${c.icone} ${c.nome}` }));
  }
}

function renderPlano() {
  const p = estado.perfil;
  q('#pl-salario').value = p.salarioLiquido || '';
  q('#pl-dia').value = p.diaPagamento || 5;
  q('#pl-meta-modo').value = p.metaPoupancaModo || 'pct';
  q('#pl-meta').value = p.metaPoupancaModo === 'valor' ? (p.metaPoupancaValor || '') : (p.metaPoupancaPct ?? 20);
  q('#pl-reserva').value = p.reservaAtual || '';
  q('#pl-reserva-meses').value = p.reservaAlvoMeses ?? 6;

  const rv = B.reserva(estado);
  q('#reserva-barra').style.width = `${Math.round(rv.pct * 100)}%`;
  q('#reserva-barra').style.background = 'var(--sp-violeta)';
  q('#reserva-texto').textContent = rv.alvo > 0
    ? `${brl(rv.atual)} de ${brl(rv.alvo)} — ${rv.meses} meses de custo fixo (${brl(rv.custoFixo)}/mes). Faltam ${brl(rv.falta)}.`
    : 'Cadastre suas contas fixas para o alvo da reserva ser calculado.';

  // fixos
  const lf = q('#lista-fixos');
  lf.textContent = '';
  const fixos = B.fixosAtivos(estado);
  if (!fixos.length) lf.append(el('p', { class: 'vazio', texto: 'Nenhuma conta fixa cadastrada.' }));
  for (const f of fixos) {
    const c = cat(f.categoriaId);
    const faixa = el('span', { class: 'faixa' });
    faixa.style.background = corDe(c);
    lf.append(el('button', {
      class: 'envelope', type: 'button',
      onclick: () => { if (confirm(`Remover "${f.nome}"?`)) { S.apagarDe(estado, 'fixos', f.id); persistir(); } },
    }, [
      faixa,
      el('span', { class: 'ic', texto: c ? c.icone : '•' }),
      el('span', {}, [el('div', { class: 'nome', texto: f.nome }),
        el('div', { class: 'det', texto: c ? c.nome.split('—')[0].trim() : '' })]),
      el('span', { class: 'cifra', texto: brl(f.valor) }, [el('small', { texto: 'por mes' })]),
    ]));
  }

  // parcelamentos
  const lp = q('#lista-parcelas');
  lp.textContent = '';
  const parcs = B.vivos(estado.parcelamentos);
  if (!parcs.length) lp.append(el('p', { class: 'vazio', texto: 'Nenhum parcelamento em aberto.' }));
  for (const pa of parcs) {
    const atual = B.mesesEntre(pa.primeiraCompetencia, B.ymHoje()) + 1;
    const restantes = Math.max(0, pa.nParcelas - atual + 1);
    const c = cat(pa.categoriaId);
    const faixa = el('span', { class: 'faixa' });
    faixa.style.background = corDe(c);
    lp.append(el('button', {
      class: 'envelope', type: 'button',
      onclick: () => { if (confirm(`Remover o parcelamento "${pa.descricao}"?`)) { S.apagarDe(estado, 'parcelamentos', pa.id); persistir(); } },
    }, [
      faixa,
      el('span', { class: 'ic', texto: '💳' }),
      el('span', {}, [el('div', { class: 'nome', texto: pa.descricao || 'Parcelamento' }),
        el('div', { class: 'det', texto: `${Math.min(Math.max(atual, 1), pa.nParcelas)}/${pa.nParcelas} · faltam ${restantes} ${restantes === 1 ? 'mes' : 'meses'}` })]),
      el('span', { class: 'cifra', texto: brl(pa.valorTotal / pa.nParcelas) }, [el('small', { texto: 'por mes' })]),
    ]));
  }

  // projecao
  const corpo = q('#projecao-corpo');
  corpo.textContent = '';
  for (const linha of B.projecao(estado, 12)) {
    corpo.append(el('tr', { class: linha.sobra < 0 ? 'apertado' : '' }, [
      el('td', { texto: B.rotuloMes(linha.ym).replace(' de ', '/') }),
      el('td', { class: 'num', texto: brl(linha.fixos) }),
      el('td', { class: 'num', texto: brl(linha.parcelas) }),
      el('td', { class: 'num', texto: brl(linha.meta) }),
      el('td', { class: 'num', texto: brl(linha.sobra) }),
    ]));
  }

  preencherSelectCategorias(q('#fx-cat'), (c) => c.tipo === 'fixo' && c.balde !== 'futuro');
  if (!q('#pc-inicio').value) q('#pc-inicio').value = B.ymHoje();
  renderSimulacao();
}

for (const [id, campo, conv] of [
  ['#pl-salario', 'salarioLiquido', Number],
  ['#pl-dia', 'diaPagamento', Number],
  ['#pl-reserva', 'reservaAtual', Number],
  ['#pl-reserva-meses', 'reservaAlvoMeses', Number],
]) {
  q(id).addEventListener('change', (ev) => {
    S.atualizarPerfil(estado, { [campo]: conv(ev.target.value) || 0 });
    persistir();
  });
}

q('#pl-meta-modo').addEventListener('change', (ev) => {
  S.atualizarPerfil(estado, { metaPoupancaModo: ev.target.value });
  persistir();
});
q('#pl-meta').addEventListener('change', (ev) => {
  const v = Number(ev.target.value) || 0;
  const campo = estado.perfil.metaPoupancaModo === 'valor' ? 'metaPoupancaValor' : 'metaPoupancaPct';
  S.atualizarPerfil(estado, { [campo]: v });
  persistir();
});

q('#fx-add').addEventListener('click', () => {
  const nome = q('#fx-nome').value.trim();
  const valor = Number(q('#fx-valor').value);
  if (!nome || !(valor > 0)) { torrada('Preencha nome e valor.'); return; }
  S.novoFixo(estado, { nome, valor, categoriaId: q('#fx-cat').value });
  q('#fx-nome').value = ''; q('#fx-valor').value = '';
  persistir();
  torrada('Fixo adicionado.');
});

function renderSimulacao() {
  const alvo = q('#pc-simulacao');
  alvo.textContent = '';
  const total = Number(q('#pc-total').value);
  const n = Number(q('#pc-n').value);
  if (!(total > 0) || !(n >= 1)) return;

  const sim = B.simularParcelamento(estado, { valorTotal: total, nParcelas: n, ymInicio: q('#pc-inicio').value || B.ymHoje() });
  const texto = `${n}x de ${brl(sim.parcela)}. Compromete ate ${B.rotuloMes(B.somaMeses(q('#pc-inicio').value || B.ymHoje(), n - 1))}.`;
  if (sim.apertados.length) {
    alvo.append(caixaAviso(`${texto} Com ela, ${sim.apertados.length} ${sim.apertados.length === 1 ? 'mes fica' : 'meses ficam'} no vermelho — o primeiro em ${B.rotuloMes(sim.apertados[0].ym)}.`, 'ruim'));
  } else {
    alvo.append(caixaAviso(`${texto} A sobra variavel continua positiva em todos os meses.`, 'ok'));
  }
}

for (const id of ['#pc-total', '#pc-n', '#pc-inicio']) q(id).addEventListener('input', renderSimulacao);

q('#pc-add').addEventListener('click', () => {
  const descricao = q('#pc-desc').value.trim();
  const valorTotal = Number(q('#pc-total').value);
  const nParcelas = Number(q('#pc-n').value);
  if (!(valorTotal > 0) || !(nParcelas >= 1)) { torrada('Informe valor total e numero de parcelas.'); return; }
  S.novoParcelamento(estado, {
    descricao: descricao || 'Parcelamento', valorTotal, nParcelas,
    primeiraCompetencia: q('#pc-inicio').value || B.ymHoje(),
  });
  q('#pc-desc').value = ''; q('#pc-total').value = '';
  persistir();
  torrada('Parcelamento registrado.');
});

// ---------------------------------------------------------------- folha

let folha = { valorCent: 0, categoriaId: null, tipo: 'despesa', editando: null };

function abrirFolha({ editar = null } = {}) {
  const l = editar ? estado.lancamentos.find((x) => x.id === editar) : null;
  folha = {
    valorCent: l ? Math.round(l.valor * 100) : 0,
    categoriaId: l ? l.categoriaId : null,
    tipo: l ? l.tipo : 'despesa',
    editando: l ? l.id : null,
  };
  q('#folha-titulo').textContent = l ? 'Editar' : 'Lancar';
  q('#lc-desc').value = l ? l.descricao : '';
  q('#lc-data').value = l ? l.data : B.hojeISO();
  q('#lc-forma').value = l ? l.formaPagamento : 'debito';
  q('#folha-extra').hidden = !l;
  q('#lc-apagar').hidden = !l;
  q('#folha').hidden = false;
  document.body.style.overflow = 'hidden';
  renderFolha();
}

function fecharFolha() {
  q('#folha').hidden = true;
  document.body.style.overflow = '';
}

function renderFolha() {
  const m = q('#mostrador');
  m.textContent = brl(folha.valorCent / 100);
  m.classList.toggle('zero', folha.valorCent === 0);

  q('#tipo-despesa').setAttribute('aria-pressed', String(folha.tipo === 'despesa'));
  q('#tipo-receita').setAttribute('aria-pressed', String(folha.tipo === 'receita'));

  const grade = q('#folha-cats');
  grade.textContent = '';
  const disponiveis = folha.tipo === 'receita'
    ? catsAtivas().filter((c) => c.natureza === 'receita')
    : ordenarPorUso(catsAtivas().filter((c) => c.tipo === 'variavel' && c.natureza !== 'receita'));

  for (const c of disponiveis) {
    const b = el('button', {
      class: 'cat-btn', type: 'button',
      'aria-pressed': String(folha.categoriaId === c.id),
      onclick: () => { folha.categoriaId = c.id; renderFolha(); },
    }, [
      el('span', { class: 'ic', texto: c.icone }),
      el('span', { class: 'n', texto: c.nome.split('—')[0].trim() }),
    ]);
    b.style.setProperty('--cor', corDe(c));
    grade.append(b);
  }

  const escolhida = folha.categoriaId ? cat(folha.categoriaId) : null;
  q('#mostrador-cat').textContent = escolhida ? escolhida.nome : 'escolha uma categoria';
  q('#folha-salvar').disabled = !(folha.valorCent > 0 && folha.categoriaId);
}

/** As categorias que voce mais usa sobem — menos rolagem no corredor do mercado. */
function ordenarPorUso(lista) {
  const uso = new Map();
  const recentes = B.vivos(estado.lancamentos).slice(-60);
  for (const l of recentes) uso.set(l.categoriaId, (uso.get(l.categoriaId) || 0) + 1);
  return [...lista].sort((a, b) => (uso.get(b.id) || 0) - (uso.get(a.id) || 0));
}

q('#teclado').addEventListener('click', (ev) => {
  const t = ev.target.closest('button')?.dataset.t;
  if (!t) return;
  if (t === 'del') folha.valorCent = Math.floor(folha.valorCent / 10);
  else {
    const proximo = Number(String(folha.valorCent) + t);
    if (proximo <= 99999999) folha.valorCent = proximo;
  }
  renderFolha();
});

q('#tipo-despesa').addEventListener('click', () => { folha.tipo = 'despesa'; folha.categoriaId = null; renderFolha(); });
q('#tipo-receita').addEventListener('click', () => { folha.tipo = 'receita'; folha.categoriaId = 'extra'; renderFolha(); });
q('#folha-fechar').addEventListener('click', fecharFolha);
q('#folha-mais').addEventListener('click', () => { q('#folha-extra').hidden = !q('#folha-extra').hidden; });
q('#btn-lancar').addEventListener('click', () => abrirFolha());

q('#lc-apagar').addEventListener('click', () => {
  if (!folha.editando || !confirm('Apagar este lancamento?')) return;
  S.apagarLancamento(estado, folha.editando);
  fecharFolha();
  persistir();
  torrada('Lancamento apagado.');
});

q('#folha-salvar').addEventListener('click', () => {
  const dados = {
    tipo: folha.tipo,
    valor: folha.valorCent / 100,
    categoriaId: folha.categoriaId,
    data: q('#lc-data').value || B.hojeISO(),
    descricao: q('#lc-desc').value,
    formaPagamento: q('#lc-forma').value,
  };
  if (folha.editando) S.editarLancamento(estado, folha.editando, dados);
  else S.novoLancamento(estado, dados);
  fecharFolha();
  persistir();
  tocarRegistro();

  const r = B.resumo(estado, B.ymHoje());
  torrada(folha.editando ? 'Atualizado.' : `Registrado. Sobram ${brl(r.porDia)} hoje.`);
});

document.addEventListener('keydown', (ev) => {
  if (q('#folha').hidden) return;
  if (ev.key === 'Escape') fecharFolha();
  else if (/^[0-9]$/.test(ev.key)) { folha.valorCent = Number(String(folha.valorCent) + ev.key); renderFolha(); }
  else if (ev.key === 'Backspace') { folha.valorCent = Math.floor(folha.valorCent / 10); renderFolha(); }
});

// ---------------------------------------------------------------- onboarding

q('#ob-continuar').addEventListener('click', () => {
  const salario = Number(q('#ob-salario').value);
  if (!(salario > 0)) { torrada('Informe um salario maior que zero.'); return; }
  S.atualizarPerfil(estado, {
    salarioLiquido: salario,
    diaPagamento: Number(q('#ob-dia').value) || 5,
    metaPoupancaPct: Number(q('#ob-meta').value) || 0,
    metaPoupancaModo: 'pct',
  });
  S.salvar(estado);
  q('#ob-passo2').hidden = false;
  preencherSelectCategorias(q('#ob-fixo-cat'), (c) => c.tipo === 'fixo' && c.balde !== 'futuro');
  q('#ob-passo2').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

q('#ob-fixo-add').addEventListener('click', () => {
  const nome = q('#ob-fixo-nome').value.trim();
  const valor = Number(q('#ob-fixo-valor').value);
  if (!nome || !(valor > 0)) { torrada('Preencha nome e valor.'); return; }
  S.novoFixo(estado, { nome, valor, categoriaId: q('#ob-fixo-cat').value });
  S.salvar(estado);
  q('#ob-fixo-nome').value = ''; q('#ob-fixo-valor').value = '';
  renderOnboardingFixos();
});

function renderOnboardingFixos() {
  const alvo = q('#ob-lista-fixos');
  alvo.textContent = '';
  for (const f of B.fixosAtivos(estado)) {
    const c = cat(f.categoriaId);
    const faixa = el('span', { class: 'faixa' });
    faixa.style.background = corDe(c);
    alvo.append(el('div', { class: 'envelope' }, [
      faixa,
      el('span', { class: 'ic', texto: c ? c.icone : '•' }),
      el('span', {}, [el('div', { class: 'nome', texto: f.nome })]),
      el('span', { class: 'cifra', texto: brl(f.valor) }),
    ]));
  }
}

q('#ob-finalizar').addEventListener('click', () => {
  const { sugestao } = B.sugerirEnvelopes(estado, B.ymHoje());
  for (const [id, v] of Object.entries(sugestao)) S.definirLimite(estado, id, v);
  S.atualizarPerfil(estado, { onboardingFeito: true });
  persistir({ resync: false });
  irPara('hoje');
  torrada('Pronto. Ajuste os envelopes quando quiser.');
});

// ---------------------------------------------------------------- sync

function renderAjustes() {
  q('#sy-repo').value = estado.sync.repo || '';
  q('#sy-branch').value = estado.sync.branch || 'main';
  q('#sy-caminho').value = estado.sync.caminho || 'dados.json';
  q('#sy-token').value = S.lerToken();
  q('#opt-som').checked = localStorage.getItem('money.som') === '1';

  const alvo = q('#sync-estado');
  alvo.textContent = '';
  if (!estado.sync.repo) {
    alvo.append(caixaAviso('Sincronizacao desligada. O app funciona normalmente — os dados ficam so neste aparelho.', ''));
  } else if (S.temPendencia()) {
    alvo.append(caixaAviso('Ha alteracoes locais ainda nao enviadas.', ''));
  } else if (estado.sync.ultimaSync) {
    alvo.append(caixaAviso(`Em dia. Ultima sincronizacao em ${new Date(estado.sync.ultimaSync).toLocaleString('pt-BR')}.`, 'ok'));
  }
}

q('#opt-som').addEventListener('change', (ev) => {
  localStorage.setItem('money.som', ev.target.checked ? '1' : '0');
  if (ev.target.checked) tocarRegistro();
});

q('#sy-testar').addEventListener('click', async () => {
  const alvo = q('#sy-resultado');
  alvo.textContent = '';
  alvo.append(caixaAviso('Testando…', ''));
  try {
    const info = await testarConexao({ repo: q('#sy-repo').value.trim(), token: q('#sy-token').value.trim() });
    alvo.textContent = '';
    alvo.append(caixaAviso(`Conectado a ${info.repo} (branch ${info.branch}), com permissao de escrita.`, 'ok'));
    if (info.aviso) alvo.append(caixaAviso(info.aviso, 'ruim'));
  } catch (e) {
    alvo.textContent = '';
    alvo.append(caixaAviso(e.message, 'ruim'));
  }
});

q('#sy-salvar').addEventListener('click', async () => {
  estado.sync = {
    ...estado.sync,
    repo: q('#sy-repo').value.trim(),
    branch: q('#sy-branch').value.trim() || 'main',
    caminho: q('#sy-caminho').value.trim() || 'dados.json',
  };
  S.gravarToken(q('#sy-token').value.trim());
  S.salvar(estado);
  await sincronizarAgora({ manual: true });
  render();
});

async function sincronizarAgora({ manual = false } = {}) {
  if (sincronizando) return;
  const token = S.lerToken();
  if (!estado.sync.repo || !token) {
    if (manual) torrada('Configure o repositorio e o token primeiro.');
    return;
  }
  sincronizando = true;
  q('#btn-sync').classList.add('pendente');
  try {
    const { estado: novo, enviou } = await sincronizar(estado, token);
    estado = novo;
    S.salvar(estado);
    render();
    if (manual) torrada(enviou ? 'Enviado para o repositorio.' : 'Ja estava em dia.');
  } catch (e) {
    const msg = e instanceof ErroSync ? e.message : 'Falha inesperada ao sincronizar.';
    if (manual) {
      const alvo = q('#sy-resultado');
      if (alvo) { alvo.textContent = ''; alvo.append(caixaAviso(msg, 'ruim')); }
      torrada('Nao foi possivel sincronizar.');
    } else if (e.codigo !== 'offline') {
      console.warn('sync:', msg);
    }
  } finally {
    sincronizando = false;
    q('#btn-sync').classList.toggle('pendente', S.temPendencia());
  }
}

function agendarSync() {
  if (!estado.sync.repo || !S.lerToken()) return;
  clearTimeout(timerSync);
  timerSync = setTimeout(() => sincronizarAgora(), 4000);
}

q('#btn-sync').addEventListener('click', () => sincronizarAgora({ manual: true }));
window.addEventListener('online', () => sincronizarAgora());
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizarAgora(); });

// ---------------------------------------------------------------- backup

q('#btn-exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S.paraSincronizar(estado), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `money-${B.hojeISO()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  torrada('Arquivo gerado.');
});

q('#btn-importar').addEventListener('click', () => q('#arquivo-importar').click());
q('#arquivo-importar').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (!dados || !Array.isArray(dados.lancamentos)) throw new Error('formato');
    estado = S.mesclar(estado, dados);
    S.salvar(estado);
    S.marcarPendencia(true);
    render();
    torrada('Dados importados e mesclados.');
  } catch {
    alert('Arquivo invalido. Escolha um JSON exportado por este app.');
  }
  ev.target.value = '';
});

q('#btn-zerar').addEventListener('click', () => {
  if (!confirm('Apagar todos os dados deste aparelho? O que ja foi sincronizado continua no repositorio.')) return;
  if (!confirm('Confirma? Esta acao nao tem volta neste aparelho.')) return;
  localStorage.removeItem('money.estado.v1');
  localStorage.removeItem('money.sync.pendente');
  location.reload();
});

// ---------------------------------------------------------------- render

function render() {
  q('#btn-sync').classList.toggle('pendente', S.temPendencia() && !!estado.sync.repo);

  if (!estado.perfil.onboardingFeito && telaAtual !== 'ajustes') {
    qa('.tela').forEach((s) => s.classList.toggle('ativa', s.id === 'tela-onboarding'));
    q('#subtitulo').textContent = 'primeira configuracao';
    renderOnboardingFixos();
    return;
  }

  const r = B.resumo(estado, B.ymHoje());
  q('#subtitulo').textContent = estado.perfil.salarioLiquido > 0
    ? `${B.rotuloMes(B.ymHoje())} · ${brl(r.livre)} livres`
    : B.rotuloMes(B.ymHoje());

  if (telaAtual === 'hoje') renderHoje();
  else if (telaAtual === 'envelopes') renderEnvelopes();
  else if (telaAtual === 'extrato') renderExtrato();
  else if (telaAtual === 'plano') renderPlano();
  else if (telaAtual === 'ajustes') renderAjustes();
}

// ---------------------------------------------------------------- inicio

aplicarTema();
irPara('hoje');
sincronizarAgora();

// atalho do icone na tela inicial: abre direto no teclado de lancamento
if (new URLSearchParams(location.search).get('acao') === 'lancar' && estado.perfil.onboardingFeito) {
  abrirFolha();
  history.replaceState(null, '', location.pathname);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker:', e));
  });
}
