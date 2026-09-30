// Carimba a VERSAO do service worker com o hash do shell.
//
// O sw.js serve o app em cache-first -- inclusive a navegacao. Se a VERSAO nao
// muda, o celular com o app instalado nunca ve a correcao publicada. Derivar a
// versao do conteudo tira essa lembranca da cabeca de quem publica, e o teste
// de fluxo reprova quando ela fica para tras.
//
//   node scripts/versao-sw.mjs          # regrava a VERSAO
//   node scripts/versao-sw.mjs --checar # so confere (sai com 1 se desatualizada)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const SW = `${RAIZ}/sw.js`;
const LINHA_VERSAO = /^const VERSAO = '([^']*)';$/m;
const BINARIOS = new Set(['.png']);

// CRLF/LF nao pode mudar o hash: um checkout no Windows daria outra versao.
function conteudo(caminho) {
  const bruto = readFileSync(caminho);
  return BINARIOS.has(extname(caminho)) ? bruto : bruto.toString('utf8').replace(/\r\n/g, '\n');
}

export function versaoGravada() {
  return readFileSync(SW, 'utf8').match(LINHA_VERSAO)?.[1] ?? null;
}

export function calcularVersao() {
  const sw = readFileSync(SW, 'utf8').replace(/\r\n/g, '\n');
  const lista = sw.match(/const ARQUIVOS = \[([\s\S]*?)\];/)?.[1];
  if (!lista) throw new Error('lista ARQUIVOS nao encontrada no sw.js');
  const arquivos = [...lista.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

  const h = createHash('sha256');
  // o proprio sw.js entra, sem a linha da versao -- mudar a estrategia de
  // cache tambem precisa chegar ao aparelho
  h.update(sw.replace(LINHA_VERSAO, ''));
  for (const a of arquivos) {
    h.update(`\0${a}\0`);
    h.update(conteudo(`${RAIZ}/${a}`));
  }
  return `money-${h.digest('hex').slice(0, 10)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nova = calcularVersao();
  const atual = versaoGravada();
  if (process.argv.includes('--checar')) {
    console.log(atual === nova ? `ok  ${atual}` : `desatualizada: ${atual} -> ${nova}`);
    process.exit(atual === nova ? 0 : 1);
  }
  if (atual === nova) {
    console.log(`VERSAO ja em dia: ${atual}`);
  } else {
    writeFileSync(SW, readFileSync(SW, 'utf8').replace(LINHA_VERSAO, `const VERSAO = '${nova}';`));
    console.log(`VERSAO ${atual} -> ${nova}`);
  }
}
