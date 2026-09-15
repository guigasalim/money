// Estado do app: valor em memoria, espelho em localStorage, mesclagem com o
// que vier do GitHub. Nada aqui toca o DOM.
//
// Toda entidade sincronizavel carrega `id` e `updatedAt`, e apagar e escrever
// `deleted: true` (lapide) em vez de remover do array -- sem isso, um item
// apagado no celular ressuscitaria na proxima mesclagem com o PC.

import { hojeISO, ymHoje, cent } from './budget.js';

const CHAVE_DADOS = 'money.estado.v1';
const CHAVE_TOKEN = 'money.github.token'; // fora do estado: nunca sincroniza
const CHAVE_FILA = 'money.sync.pendente';

export const agora = () => new Date().toISOString();

export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// --- categorias padrao -------------------------------------------------------
// `peso` e a fatia relativa dentro do balde quando o app propoe os envelopes.

export const CATEGORIAS_PADRAO = [
  // Essencial — variavel (metade fria do espectro)
  { id: 'merc-comida', nome: 'Mercado — comida do dia a dia', icone: '🍚', balde: 'essencial', tipo: 'variavel', peso: 30, cor: 'verde' },
  { id: 'merc-saude', nome: 'Mercado — saude e nutricao', icone: '🥣', balde: 'essencial', tipo: 'variavel', peso: 10, cor: 'verde' },
  { id: 'merc-casa', nome: 'Mercado — casa e limpeza', icone: '🧴', balde: 'essencial', tipo: 'variavel', peso: 8, cor: 'verde' },
  { id: 'saude', nome: 'Saude — nutricionista, terapia', icone: '💊', balde: 'essencial', tipo: 'variavel', peso: 14, cor: 'azul' },
  { id: 'transporte', nome: 'Transporte', icone: '🚌', balde: 'essencial', tipo: 'variavel', peso: 8, cor: 'azul' },
  { id: 'outros-ess', nome: 'Outros essenciais', icone: '📌', balde: 'essencial', tipo: 'variavel', peso: 4, cor: 'azul' },
  // Essencial — comprometido
  { id: 'contas', nome: 'Contas fixas — moradia, luz, internet', icone: '🏠', balde: 'essencial', tipo: 'fixo', peso: 1, cor: 'azul' },
  { id: 'assin-ess', nome: 'Assinaturas essenciais', icone: '🔑', balde: 'essencial', tipo: 'fixo', peso: 1, cor: 'azul' },
  { id: 'parcelas', nome: 'Parcelas de cartao', icone: '💳', balde: 'essencial', tipo: 'fixo', peso: 1, cor: 'violeta' },
  // Qualidade de vida — variavel (metade quente)
  { id: 'merc-superfluo', nome: 'Mercado — superfluos, doce e energetico', icone: '🍫', balde: 'qualidade', tipo: 'variavel', peso: 6, cor: 'amarelo' },
  { id: 'saidas', nome: 'Saidas — restaurante e fast food', icone: '🍔', balde: 'qualidade', tipo: 'variavel', peso: 10, cor: 'laranja' },
  { id: 'jogos', nome: 'Jogos e hobbies', icone: '🎮', balde: 'qualidade', tipo: 'variavel', peso: 7, cor: 'amarelo' },
  { id: 'compras', nome: 'Compras pessoais', icone: '🛍️', balde: 'qualidade', tipo: 'variavel', peso: 5, cor: 'vermelho' },
  { id: 'lazer', nome: 'Lazer e outros', icone: '🎬', balde: 'qualidade', tipo: 'variavel', peso: 3, cor: 'laranja' },
  // Qualidade de vida — comprometido
  { id: 'assin-nao-ess', nome: 'Assinaturas nao essenciais', icone: '📺', balde: 'qualidade', tipo: 'fixo', peso: 1, cor: 'vermelho' },
  // Futuro
  { id: 'reserva', nome: 'Reserva de emergencia', icone: '🛟', balde: 'futuro', tipo: 'fixo', peso: 1, cor: 'violeta' },
  { id: 'investimento', nome: 'Investimento', icone: '📈', balde: 'futuro', tipo: 'fixo', peso: 1, cor: 'violeta' },
  // Receitas — a luz antes do prisma
  { id: 'salario', nome: 'Salario', icone: '💼', balde: 'futuro', tipo: 'receita', natureza: 'receita', peso: 1, cor: 'verde' },
  { id: 'extra', nome: 'Renda extra', icone: '✨', balde: 'futuro', tipo: 'receita', natureza: 'receita', peso: 1, cor: 'verde' },
];

export function estadoInicial() {
  return {
    versao: 1,
    perfil: {
      salarioLiquido: 0,
      diaPagamento: 5,
      metaPoupancaModo: 'pct',
      metaPoupancaPct: 20,
      metaPoupancaValor: 0,
      reservaAlvoMeses: 6,
      reservaAtual: 0,
      cartaoFechamento: 28,
      cartaoVencimento: 5,
      onboardingFeito: false,
      atualizadoEm: agora(),
    },
    categorias: CATEGORIAS_PADRAO.map((c) => ({ ...c, limite: 0, arquivada: false, updatedAt: agora() })),
    fixos: [],
    parcelamentos: [],
    lancamentos: [],
    sync: { repo: '', branch: 'main', caminho: 'dados.json', ultimoSha: null, ultimaSync: null },
  };
}

// --- persistencia local ------------------------------------------------------

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE_DADOS);
    if (!bruto) return estadoInicial();
    return migrar(JSON.parse(bruto));
  } catch (e) {
    console.warn('Estado local ilegivel, comecando do zero.', e);
    return estadoInicial();
  }
}

export function salvar(estado) {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(estado));
    return true;
  } catch (e) {
    console.error('Nao foi possivel gravar no aparelho.', e);
    return false;
  }
}

function migrar(estado) {
  const base = estadoInicial();
  const saida = {
    ...base,
    ...estado,
    perfil: { ...base.perfil, ...(estado.perfil || {}) },
    sync: { ...base.sync, ...(estado.sync || {}) },
  };
  for (const chave of ['categorias', 'fixos', 'parcelamentos', 'lancamentos']) {
    if (!Array.isArray(saida[chave])) saida[chave] = base[chave] || [];
  }
  // cores viraram tokens do espectro; converte estados gravados antes disso
  const padrao = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c]));
  for (const c of saida.categorias) {
    if (typeof c.cor === 'string' && c.cor.startsWith('#')) {
      c.cor = padrao.get(c.id)?.cor || 'azul';
    }
  }

  // categorias novas de uma versao posterior do app entram sem apagar as do usuario
  const existentes = new Set(saida.categorias.map((c) => c.id));
  for (const c of base.categorias) {
    if (!existentes.has(c.id)) saida.categorias.push(c);
  }
  return saida;
}

// --- token: so no aparelho ---------------------------------------------------

export const lerToken = () => localStorage.getItem(CHAVE_TOKEN) || '';
export const gravarToken = (t) => localStorage.setItem(CHAVE_TOKEN, t || '');
export const apagarToken = () => localStorage.removeItem(CHAVE_TOKEN);

export const temPendencia = () => localStorage.getItem(CHAVE_FILA) === '1';
export const marcarPendencia = (v) => localStorage.setItem(CHAVE_FILA, v ? '1' : '0');

// --- mutacoes ----------------------------------------------------------------
// Toda escrita carimba updatedAt e marca pendencia de sincronizacao.

function carimbar(obj) {
  obj.updatedAt = agora();
  return obj;
}

export function novoLancamento(estado, dados) {
  const l = carimbar({
    id: uid(),
    tipo: dados.tipo || 'despesa',
    valor: cent(dados.valor),
    categoriaId: dados.categoriaId,
    data: dados.data || hojeISO(),
    descricao: (dados.descricao || '').trim(),
    formaPagamento: dados.formaPagamento || 'debito',
    deleted: false,
  });
  estado.lancamentos.push(l);
  marcarPendencia(true);
  return l;
}

export function editarLancamento(estado, id, mudancas) {
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) return null;
  Object.assign(l, mudancas);
  if (mudancas.valor !== undefined) l.valor = cent(mudancas.valor);
  carimbar(l);
  marcarPendencia(true);
  return l;
}

export function apagarLancamento(estado, id) {
  const l = estado.lancamentos.find((x) => x.id === id);
  if (!l) return false;
  l.deleted = true;
  carimbar(l);
  marcarPendencia(true);
  return true;
}

export function novoParcelamento(estado, dados) {
  const p = carimbar({
    id: uid(),
    descricao: (dados.descricao || '').trim(),
    valorTotal: cent(dados.valorTotal),
    nParcelas: Math.max(1, Math.round(dados.nParcelas)),
    primeiraCompetencia: dados.primeiraCompetencia || ymHoje(),
    categoriaId: dados.categoriaId || 'parcelas',
    deleted: false,
  });
  estado.parcelamentos.push(p);
  marcarPendencia(true);
  return p;
}

export function novoFixo(estado, dados) {
  const f = carimbar({
    id: uid(),
    nome: (dados.nome || '').trim(),
    valor: cent(dados.valor),
    categoriaId: dados.categoriaId || 'contas',
    diaVencimento: dados.diaVencimento || 1,
    ativo: dados.ativo !== false,
    deleted: false,
  });
  estado.fixos.push(f);
  marcarPendencia(true);
  return f;
}

export function apagarDe(estado, colecao, id) {
  const item = (estado[colecao] || []).find((x) => x.id === id);
  if (!item) return false;
  item.deleted = true;
  carimbar(item);
  marcarPendencia(true);
  return true;
}

export function definirLimite(estado, categoriaId, limite) {
  const c = estado.categorias.find((x) => x.id === categoriaId);
  if (!c) return null;
  c.limite = cent(limite);
  carimbar(c);
  marcarPendencia(true);
  return c;
}

export function atualizarPerfil(estado, mudancas) {
  Object.assign(estado.perfil, mudancas, { atualizadoEm: agora() });
  marcarPendencia(true);
  return estado.perfil;
}

// --- mesclagem ---------------------------------------------------------------

function mesclarLista(local = [], remoto = []) {
  const mapa = new Map();
  for (const item of remoto) if (item?.id) mapa.set(item.id, item);
  for (const item of local) {
    if (!item?.id) continue;
    const outro = mapa.get(item.id);
    if (!outro) { mapa.set(item.id, item); continue; }
    // o carimbo mais recente vence; empate fica com o remoto (ja consolidado)
    mapa.set(item.id, (item.updatedAt || '') > (outro.updatedAt || '') ? item : outro);
  }
  return [...mapa.values()];
}

/**
 * Junta o estado deste aparelho com o que estava no repositorio.
 * Cada item e resolvido pelo proprio carimbo, entao editar no celular e no PC
 * no mesmo dia nao faz um sobrescrever o outro por inteiro -- so o item em
 * conflito fica com a versao mais recente.
 */
export function mesclar(local, remoto) {
  if (!remoto || typeof remoto !== 'object') return local;
  const r = migrar(remoto);
  const saida = {
    versao: 1,
    perfil: (local.perfil.atualizadoEm || '') >= (r.perfil.atualizadoEm || '') ? local.perfil : r.perfil,
    categorias: mesclarLista(local.categorias, r.categorias),
    fixos: mesclarLista(local.fixos, r.fixos),
    parcelamentos: mesclarLista(local.parcelamentos, r.parcelamentos),
    lancamentos: mesclarLista(local.lancamentos, r.lancamentos),
    sync: local.sync,
  };
  return saida;
}

/** O que vai para o repositorio: tudo menos o bloco de sync (que e do aparelho). */
export function paraSincronizar(estado) {
  const { sync, ...resto } = estado;
  return { ...resto, exportadoEm: agora() };
}

/** Descarta lapides antigas para o arquivo nao crescer para sempre. */
export function compactar(estado, diasRetencao = 180) {
  const corte = new Date(Date.now() - diasRetencao * 86400000).toISOString();
  for (const chave of ['lancamentos', 'fixos', 'parcelamentos']) {
    estado[chave] = estado[chave].filter((x) => !(x.deleted && (x.updatedAt || '') < corte));
  }
  return estado;
}
