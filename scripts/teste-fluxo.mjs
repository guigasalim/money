// Teste de fluxo: sobe o app inteiro num DOM simulado e percorre o caminho
// que o usuario percorre -- primeira configuracao, lancamento pelo teclado,
// parcelamento, navegacao. Pega erro de runtime que checagem de sintaxe nao ve.
//
//   npm install && npm test

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { calcularVersao, versaoGravada } from './versao-sw.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const html = readFileSync(`${RAIZ}/index.html`, 'utf8');

const dom = new JSDOM(html, { url: 'https://exemplo.test/money/', pretendToBeVisual: true });
const { window } = dom;

const erros = [];
window.addEventListener('error', (e) => erros.push('window.error: ' + e.message));

// shims que o jsdom nao traz (localStorage ele ja fornece, com url definida)
let respostaPrompt = null, respostaConfirm = true;
window.prompt = () => respostaPrompt;
window.confirm = () => respostaConfirm;
window.alert = () => {};
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.fetch = async () => { throw new Error('rede desligada no teste'); };

for (const k of ['window', 'document', 'localStorage', 'navigator', 'location', 'HTMLElement',
                 'Element', 'Node', 'Blob', 'URL', 'CustomEvent', 'getComputedStyle',
                 'prompt', 'confirm', 'alert', 'requestAnimationFrame', 'AudioContext']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true }); }
}
try { globalThis.document = window.document; } catch { Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true }); }
try { globalThis.window = window; } catch { Object.defineProperty(globalThis, 'window', { value: window, configurable: true }); }
try { globalThis.localStorage = window.localStorage; } catch { Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true }); }
try { globalThis.prompt = window.prompt; } catch { Object.defineProperty(globalThis, 'prompt', { value: window.prompt, configurable: true }); }
try { globalThis.confirm = window.confirm; } catch { Object.defineProperty(globalThis, 'confirm', { value: window.confirm, configurable: true }); }
try { globalThis.alert = window.alert; } catch { Object.defineProperty(globalThis, 'alert', { value: window.alert, configurable: true }); }
try { globalThis.Element = window.Element; } catch { Object.defineProperty(globalThis, 'Element', { value: window.Element, configurable: true }); }

const q = (s) => window.document.querySelector(s);
const clicar = (s) => { const n = q(s); if (!n) throw new Error('nao existe: ' + s); n.click(); };
const digitar = (s, v) => {
  const n = q(s); n.value = String(v);
  n.dispatchEvent(new window.Event('input', { bubbles: true }));
  n.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const texto = (s) => q(s)?.textContent.trim();
let falhas = 0;
const ok = (cond, msg) => { if (!cond) falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'}  ${msg}`); };

await import(`file://${RAIZ}/js/ui.js`);
await new Promise((r) => setTimeout(r, 60));

console.log('--- boot ---');
ok(erros.length === 0, `sem erro no carregamento${erros.length ? ': ' + erros.join('; ') : ''}`);
ok(q('#tela-onboarding').classList.contains('ativa'), 'abre na primeira configuracao');

console.log('\n--- onboarding ---');
digitar('#ob-salario', 4200);
digitar('#ob-dia', 5);
digitar('#ob-meta', 20);
clicar('#ob-continuar');
ok(!q('#ob-passo2').hidden, 'avanca para contas fixas');

digitar('#ob-fixo-nome', 'Aluguel'); digitar('#ob-fixo-valor', 1300);
q('#ob-fixo-cat').value = 'contas'; clicar('#ob-fixo-add');
digitar('#ob-fixo-nome', 'Internet'); digitar('#ob-fixo-valor', 110);
q('#ob-fixo-cat').value = 'contas'; clicar('#ob-fixo-add');
digitar('#ob-fixo-nome', 'Spotify'); digitar('#ob-fixo-valor', 22);
q('#ob-fixo-cat').value = 'assin-nao-ess'; clicar('#ob-fixo-add');
ok(q('#ob-lista-fixos').children.length === 3, 'tres fixos cadastrados');

clicar('#ob-finalizar');
ok(q('#tela-hoje').classList.contains('ativa'), 'vai para a tela Hoje');

console.log('\n--- calculo ---');
// 4200 - 1432 fixos - 840 meta = 1928 variavel
console.log('   sobra por dia :', texto('#painel-valor'));
console.log('   livre no mes  :', texto('#painel-livre'));
ok(texto('#painel-valor') !== '—', 'painel preenchido');
ok(q('#prisma-bandas').children.length > 0, `prisma desenhou ${q('#prisma-bandas').children.length} bandas`);
ok(q('#prisma-legenda').children.length > 0, 'legenda do prisma preenchida');
ok(q('#baldes').children.length === 3, 'tres baldes');

console.log('\n--- lancamento pelo teclado ---');
clicar('#btn-lancar');
ok(!q('#folha').hidden, 'folha abriu');
for (const d of ['4', '7', '5', '0']) q(`#teclado button[data-t="${d}"]`).click(); // 47,50
ok(texto('#mostrador').includes('47,50'), `mostrador: ${texto('#mostrador')}`);
ok(q('#folha-salvar').disabled, 'salvar bloqueado sem categoria');
const botoesCat = [...q('#folha-cats').querySelectorAll('.cat-btn')];
ok(botoesCat.length > 0, `${botoesCat.length} categorias oferecidas`);
botoesCat[0].click();
ok(!q('#folha-salvar').disabled, 'salvar liberado com valor e categoria');
clicar('#folha-salvar');
ok(q('#folha').hidden, 'folha fechou apos salvar');
ok(texto('#ultimos').includes('47,50') || q('#ultimos').textContent.includes('47,50'), 'lancamento aparece em Ultimos');

console.log('\n--- navegacao entre telas ---');
for (const tela of ['envelopes', 'extrato', 'plano', 'ajustes']) {
  const antes = erros.length;
  q(`.nav button[data-tela="${tela}"]`)?.click() ?? clicar('#btn-ajustes');
  ok(erros.length === antes, `renderiza ${tela} sem erro`);
}
clicar('#btn-ajustes');
ok(q('#tela-ajustes').classList.contains('ativa'), 'ajustes acessivel pela engrenagem');

console.log('\n--- envelopes ---');
q('.nav button[data-tela="envelopes"]').click();
const envs = q('#env-essencial').children.length + q('#env-qualidade').children.length;
ok(envs > 0, `${envs} envelopes listados`);
console.log('   disponivel:', texto('#env-disponivel'));
console.log('   conferencia:', q('#env-sobra-aviso').textContent.trim());

console.log('\n--- parcelamento e projecao ---');
q('.nav button[data-tela="plano"]').click();
digitar('#pc-desc', 'Celular'); digitar('#pc-total', 3600); digitar('#pc-n', 12);
ok(q('#pc-simulacao').textContent.length > 0, 'simulacao aparece antes de confirmar');
console.log('   ' + q('#pc-simulacao').textContent.trim().slice(0, 130));
clicar('#pc-add');
ok(q('#lista-parcelas').children.length === 1, 'parcelamento registrado');
ok(q('#projecao-corpo').children.length === 12, 'projecao de 12 meses');

q('.nav button[data-tela="hoje"]').click();
console.log('   sobra por dia depois da parcela:', texto('#painel-valor'));

console.log('\n--- persistencia ---');
const gravado = JSON.parse(window.localStorage.getItem('money.estado.v1'));
ok(gravado.lancamentos.length === 1, 'lancamento persistido');
ok(gravado.fixos.length === 3, 'fixos persistidos');
ok(gravado.parcelamentos.length === 1, 'parcelamento persistido');
ok(!JSON.stringify(gravado).includes('github_pat'), 'nenhum token dentro do estado');

console.log('\n--- service worker ---');
const versao = calcularVersao();
ok(versaoGravada() === versao, `VERSAO do sw.js acompanha o shell${versaoGravada() === versao ? '' : ` -- rode npm run versao (${versaoGravada()} -> ${versao})`}`);

console.log('\n--- resultado ---');
ok(erros.length === 0, erros.length ? 'erros: ' + erros.join(' | ') : 'nenhum erro de runtime em todo o fluxo');
process.exit(falhas ? 1 : 0);
