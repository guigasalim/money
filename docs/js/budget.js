// Motor financeiro. Puro: sem DOM, sem rede, sem localStorage.
//
// Modelo de orcamento adotado (envelope com saldo projetado):
//
//   renda liquida
//    - contas fixas e assinaturas (ja comprometidas)
//    - parcelas de cartao que caem neste mes
//    - meta de poupanca (tratada como despesa fixa, nao como sobra)
//    = dinheiro variavel do mes  -> dividido em envelopes por categoria
//
// Fixos e parcelas NAO sao lancados como despesa: ja saem do topo do calculo.
// So o gasto variavel e registrado, e e o unico que consome a sobra do dia.

export const BALDES = {
  essencial: { nome: 'Essencial', alvo: 0.50 },
  qualidade: { nome: 'Qualidade de vida', alvo: 0.30 },
  futuro: { nome: 'Futuro', alvo: 0.20 },
};

/** Fatia minima do dinheiro variavel reservada ao essencial (comida, saude,
 * transporte). So entra em acao quando os fixos espremem o alvo de 50%. */
export const PISO_ESSENCIAL = 0.55;

export const cent = (v) => Math.round((Number(v) || 0) * 100) / 100;

// --- datas (sempre no fuso local; toISOString() usa UTC e erra o dia) ---

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ymHoje = () => hojeISO().slice(0, 7);
export const ymDe = (dataISO) => String(dataISO).slice(0, 7);

export function diasNoMes(ym) {
  const [ano, mes] = ym.split('-').map(Number);
  return new Date(ano, mes, 0).getDate();
}

/** Dias que ainda restam no mes, contando hoje. Meses passados devolvem 0. */
export function diasRestantes(ym) {
  const atual = ymHoje();
  if (ym > atual) return diasNoMes(ym);
  if (ym < atual) return 0;
  return diasNoMes(ym) - new Date().getDate() + 1;
}

export function mesesEntre(ymInicio, ymFim) {
  const [ai, mi] = ymInicio.split('-').map(Number);
  const [af, mf] = ymFim.split('-').map(Number);
  return (af - ai) * 12 + (mf - mi);
}

export function somaMeses(ym, n) {
  const [ano, mes] = ym.split('-').map(Number);
  const d = new Date(ano, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function rotuloMes(ym) {
  const [ano, mes] = ym.split('-').map(Number);
  const nomes = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${nomes[mes - 1]} de ${ano}`;
}

// --- consultas sobre o estado ---

export const vivos = (lista) => (lista || []).filter((x) => !x.deleted);

export function mapaCategorias(estado) {
  const m = new Map();
  for (const c of vivos(estado.categorias)) m.set(c.id, c);
  return m;
}

export function lancamentosDoMes(estado, ym) {
  return vivos(estado.lancamentos).filter((l) => ymDe(l.data) === ym);
}

/** Parcelas de cartao que caem em `ym`, uma entrada por parcelamento ativo. */
export function parcelasDoMes(estado, ym) {
  const itens = [];
  for (const p of vivos(estado.parcelamentos)) {
    const i = mesesEntre(p.primeiraCompetencia, ym);
    if (i < 0 || i >= p.nParcelas) continue;
    itens.push({
      id: p.id,
      descricao: p.descricao,
      categoriaId: p.categoriaId,
      parcelaAtual: i + 1,
      nParcelas: p.nParcelas,
      valor: cent(p.valorTotal / p.nParcelas),
    });
  }
  const total = cent(itens.reduce((s, i) => s + i.valor, 0));
  return { total, itens };
}

export function fixosAtivos(estado) {
  return vivos(estado.fixos).filter((f) => f.ativo !== false);
}

/** Quanto sobra para poupar segundo o perfil: percentual da renda ou valor fixo. */
export function metaPoupanca(estado, renda) {
  const p = estado.perfil;
  if (p.metaPoupancaModo === 'valor') return cent(p.metaPoupancaValor);
  return cent((renda * (p.metaPoupancaPct ?? 20)) / 100);
}

// --- o calculo central ---

/**
 * Fotografia completa de um mes: de onde vem o dinheiro, o que ja esta
 * comprometido, quanto sobra por envelope e quanto da para gastar hoje.
 */
export function resumo(estado, ym) {
  const cats = mapaCategorias(estado);
  const lanc = lancamentosDoMes(estado, ym);
  const despesas = lanc.filter((l) => l.tipo === 'despesa');
  const receitas = lanc.filter((l) => l.tipo === 'receita');

  const extras = cent(receitas.reduce((s, l) => s + l.valor, 0));
  const renda = cent((estado.perfil.salarioLiquido || 0) + extras);

  const listaFixos = fixosAtivos(estado);
  const fixos = cent(listaFixos.reduce((s, f) => s + f.valor, 0));
  const { total: parcelas, itens: itensParcela } = parcelasDoMes(estado, ym);
  const meta = metaPoupanca(estado, renda);

  const disponivel = cent(renda - fixos - parcelas - meta);
  const gasto = cent(despesas.reduce((s, l) => s + l.valor, 0));
  const livre = cent(disponivel - gasto);

  const restam = diasRestantes(ym);
  const porDia = restam > 0 ? cent(livre / restam) : livre;

  // ritmo: quanto ja foi gasto ante o que seria proporcional ao dia do mes
  const total = diasNoMes(ym);
  const decorridos = Math.max(1, total - restam + (restam > 0 ? 1 : 0));
  const esperado = cent((disponivel * decorridos) / total);
  const ritmo = esperado > 0 ? gasto / esperado : 0;

  // --- por categoria ---
  const porCategoria = new Map();
  const garante = (id) => {
    if (!porCategoria.has(id)) {
      porCategoria.set(id, { categoriaId: id, gasto: 0, comprometido: 0, envelope: 0, lancamentos: 0 });
    }
    return porCategoria.get(id);
  };
  for (const c of cats.values()) {
    const e = garante(c.id);
    e.envelope = cent(c.limite || 0);
  }
  for (const l of despesas) {
    const e = garante(l.categoriaId);
    e.gasto = cent(e.gasto + l.valor);
    e.lancamentos += 1;
  }
  for (const f of listaFixos) garante(f.categoriaId).comprometido = cent(garante(f.categoriaId).comprometido + f.valor);
  for (const i of itensParcela) garante(i.categoriaId).comprometido = cent(garante(i.categoriaId).comprometido + i.valor);

  for (const e of porCategoria.values()) {
    const cat = cats.get(e.categoriaId);
    e.nome = cat ? cat.nome : 'Sem categoria';
    e.balde = cat ? cat.balde : 'qualidade';
    e.tipo = cat ? cat.tipo : 'variavel';
    e.icone = cat ? cat.icone : '?';
    e.restante = cent(e.envelope - e.gasto);
    e.pct = e.envelope > 0 ? e.gasto / e.envelope : (e.gasto > 0 ? 1 : 0);
    e.estouro = e.envelope > 0 && e.gasto > e.envelope;
  }

  // --- por balde, comparado com a referencia 50/30/20 ---
  const baldes = {};
  for (const [id, def] of Object.entries(BALDES)) {
    baldes[id] = { id, nome: def.nome, alvo: def.alvo, fixo: 0, parcelas: 0, gasto: 0, envelope: 0 };
  }
  for (const f of listaFixos) {
    const b = cats.get(f.categoriaId)?.balde || 'essencial';
    baldes[b].fixo = cent(baldes[b].fixo + f.valor);
  }
  for (const i of itensParcela) {
    const b = cats.get(i.categoriaId)?.balde || 'essencial';
    baldes[b].parcelas = cent(baldes[b].parcelas + i.valor);
  }
  for (const e of porCategoria.values()) {
    baldes[e.balde].gasto = cent(baldes[e.balde].gasto + e.gasto);
    baldes[e.balde].envelope = cent(baldes[e.balde].envelope + e.envelope);
  }
  baldes.futuro.fixo = cent(baldes.futuro.fixo + meta);
  for (const b of Object.values(baldes)) {
    b.total = cent(b.fixo + b.parcelas + b.gasto);
    b.pctRenda = renda > 0 ? b.total / renda : 0;
    b.alvoValor = cent(renda * b.alvo);
  }

  return {
    ym, renda, extras, fixos, parcelas, meta, disponivel, gasto, livre,
    porDia, diasRestantes: restam, diasNoMes: total, ritmo, esperado,
    itensParcela, listaFixos,
    porCategoria: [...porCategoria.values()],
    baldes,
    comprometidoPct: renda > 0 ? (fixos + parcelas) / renda : 0,
  };
}

/**
 * Proposta de envelopes a partir da renda e do que ja esta comprometido.
 * Parte da referencia 50/30/20, desconta o que cada balde ja gasta em fixos
 * e parcelas, e reparte o que sobra entre as categorias variaveis pelos pesos.
 * Quando os fixos estouram o alvo de um balde, o excedente sai do balde de
 * qualidade de vida -- que e o unico ajustavel no curto prazo.
 */
export function sugerirEnvelopes(estado, ym) {
  const r = resumo(estado, ym);
  const cats = vivos(estado.categorias)
    .filter((c) => !c.arquivada && c.tipo === 'variavel' && c.balde !== 'futuro' && c.natureza !== 'receita');

  // Espaco de cada balde pela referencia 50/30, ja descontado o comprometido.
  const porAlvo = {};
  for (const id of ['essencial', 'qualidade']) {
    const b = r.baldes[id];
    porAlvo[id] = Math.max(0, cent(b.alvoValor - b.fixo - b.parcelas));
  }

  // Normaliza para casar exatamente com o dinheiro variavel do mes.
  const somaAlvo = porAlvo.essencial + porAlvo.qualidade;
  const escala = somaAlvo > 0 ? r.disponivel / somaAlvo : 0;
  const espaco = {
    essencial: cent(porAlvo.essencial * escala),
    qualidade: cent(porAlvo.qualidade * escala),
  };

  // Piso do essencial variavel: comida, saude e transporte sao necessidade, nao
  // sobra. Quando aluguel e parcelas comem o alvo de 50%, e a qualidade de vida
  // que cede -- caso contrario a proposta manda gastar mais em saidas do que em
  // mercado, que foi o que a regra crua produzia.
  const piso = cent(r.disponivel * PISO_ESSENCIAL);
  if (espaco.essencial < piso && r.disponivel > 0) {
    espaco.essencial = Math.min(piso, r.disponivel);
    espaco.qualidade = cent(r.disponivel - espaco.essencial);
  }

  const sugestao = {};
  for (const balde of ['essencial', 'qualidade']) {
    const doBalde = cats.filter((c) => c.balde === balde);
    const pesos = doBalde.reduce((s, c) => s + (c.peso || 1), 0) || 1;
    for (const c of doBalde) {
      sugestao[c.id] = cent((espaco[balde] * (c.peso || 1)) / pesos);
    }
  }

  const alerta = r.comprometidoPct > 0.6
    ? `Fixos e parcelas ja consomem ${Math.round(r.comprometidoPct * 100)}% da renda. Acima de 60% sobra pouco para absorver imprevisto.`
    : null;

  return { sugestao, resumo: r, alerta };
}

/**
 * Compromissos ja assumidos nos proximos meses -- o que a compra parcelada de
 * hoje tira do seu mes 7. E a projecao que falta na maioria dos apps.
 */
export function projecao(estado, meses = 12, ymInicio = ymHoje()) {
  const linhas = [];
  const fixos = cent(fixosAtivos(estado).reduce((s, f) => s + f.valor, 0));
  const salario = cent(estado.perfil.salarioLiquido || 0);
  const meta = metaPoupanca(estado, salario);

  for (let i = 0; i < meses; i++) {
    const ym = somaMeses(ymInicio, i);
    const { total: parcelas, itens } = parcelasDoMes(estado, ym);
    linhas.push({
      ym,
      parcelas,
      itens,
      fixos,
      meta,
      sobra: cent(salario - fixos - parcelas - meta),
      comprometidoPct: salario > 0 ? (fixos + parcelas) / salario : 0,
    });
  }
  return linhas;
}

/**
 * Impacto de uma compra parcelada antes de confirma-la: quanto ela tira de
 * cada mes futuro e se algum mes fica no vermelho por causa dela.
 */
export function simularParcelamento(estado, { valorTotal, nParcelas, ymInicio = ymHoje() }) {
  const parcela = cent(valorTotal / nParcelas);
  const base = projecao(estado, Math.max(nParcelas, 12), ymInicio);
  const depois = base.map((l, i) => ({
    ...l,
    sobraDepois: i < nParcelas ? cent(l.sobra - parcela) : l.sobra,
  }));
  const apertados = depois.filter((l) => l.sobraDepois < 0);
  return { parcela, meses: depois, apertados };
}

/** Reserva de emergencia: alvo em meses de custo fixo, e o quanto ja andou. */
export function reserva(estado) {
  const custoFixo = cent(
    fixosAtivos(estado).reduce((s, f) => s + f.valor, 0) + parcelasDoMes(estado, ymHoje()).total
  );
  const meses = estado.perfil.reservaAlvoMeses ?? 6;
  const alvo = cent(custoFixo * meses);
  const atual = cent(estado.perfil.reservaAtual || 0);
  return { custoFixo, meses, alvo, atual, pct: alvo > 0 ? Math.min(1, atual / alvo) : 0, falta: cent(Math.max(0, alvo - atual)) };
}

export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
