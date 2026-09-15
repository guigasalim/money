// Servidor estatico para testar o app localmente. Sem dependencia: so o Node.
//
//   node scripts/servidor.mjs [porta]
//
// Escuta em 0.0.0.0 para que o celular tambem alcance pela rede -- mas veja o
// aviso impresso: service worker so vale em HTTPS ou em localhost, entao para
// testar offline e instalacao no celular use `adb reverse` (windows/5-*.bat).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs');
const PORTA = Number(process.argv[2]) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const servidor = createServer(async (req, res) => {
  try {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // normalize + prefixo impedem que ../ escape da pasta docs
    let alvo = normalize(join(RAIZ, caminho));
    if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end('403'); return; }

    try {
      if ((await stat(alvo)).isDirectory()) alvo = join(alvo, 'index.html');
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 — nao encontrado');
      return;
    }

    const corpo = await readFile(alvo);
    res.writeHead(200, {
      'content-type': TIPOS[extname(alvo)] || 'application/octet-stream',
      // sem cache: durante o teste voce quer ver a ultima versao, nao a do disco
      'cache-control': 'no-store',
      'service-worker-allowed': '/',
    }).end(corpo);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 — ' + e.message);
  }
});

function ipsDaRede() {
  const saida = [];
  for (const nomes of Object.values(networkInterfaces())) {
    for (const i of nomes || []) {
      if (i.family === 'IPv4' && !i.internal) saida.push(i.address);
    }
  }
  return saida;
}

servidor.listen(PORTA, '0.0.0.0', () => {
  console.log('');
  console.log('  money — servidor de teste');
  console.log('  ' + '-'.repeat(52));
  console.log(`  neste PC        http://localhost:${PORTA}`);
  for (const ip of ipsDaRede()) console.log(`  na rede local   http://${ip}:${PORTA}`);
  console.log('');
  console.log('  Service worker (offline + instalar) so funciona em');
  console.log('  localhost ou HTTPS. Para valer no celular, use adb reverse:');
  console.log(`    adb reverse tcp:${PORTA} tcp:${PORTA}`);
  console.log(`  e abra http://localhost:${PORTA} no Chrome do celular.`);
  console.log('');
  console.log('  Ctrl+C encerra.');
  console.log('');
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORTA} ja esta em uso. Tente: node scripts/servidor.mjs 8081\n`);
    process.exit(1);
  }
  throw e;
});
