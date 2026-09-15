// Gera os icones do app desenhando o prisma direto em pixels.
// Sem dependencia: codificador PNG minimo sobre o zlib do Node.
//
//   node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pedaco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function paraPNG(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  const linhas = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    linhas[y * (largura * 4 + 1)] = 0; // filtro "none"
    rgba.copy(linhas, y * (largura * 4 + 1) + 1, y * largura * 4, (y + 1) * largura * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', deflateSync(linhas, { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// espectro na ordem da capa, de cima para baixo
const ESPECTRO = ['#e4453a', '#f08a2e', '#f4d03f', '#3bae5a', '#4a86e8', '#a06ee0'].map(hex);
const FEIXE = hex('#f2f0eb');
const FUNDO = hex('#000000');
const ARESTA = hex('#8b8f98');

/** Ponto dentro de um poligono convexo, pelo sinal do produto vetorial. */
function dentro(px, py, pontos) {
  let sinal = 0;
  for (let i = 0; i < pontos.length; i++) {
    const [ax, ay] = pontos[i];
    const [bx, by] = pontos[(i + 1) % pontos.length];
    const cruz = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cruz === 0) continue;
    const s = cruz > 0 ? 1 : -1;
    if (sinal === 0) sinal = s;
    else if (sinal !== s) return false;
  }
  return true;
}

/** Distancia de um ponto ao segmento AB — usada para a espessura das linhas. */
function distSegmento(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * `escala` encolhe a composicao em torno do centro. Icone comum usa 1 (ocupa a
 * arte inteira); icone mascarado usa ~0.62 para caber no circulo que o Android
 * recorta, que e bem menor que o quadrado.
 */
function desenhar(tamanho, escala = 1) {
  const s = tamanho;
  const amostras = 3; // supersampling: as diagonais do prisma precisam ficar limpas
  const rgba = Buffer.alloc(s * s * 4);

  // geometria normalizada; p() aplica a escala mantendo o centro em 0.5
  const p = (x, y) => [(0.5 + (x - 0.5) * escala) * s, (0.5 + (y - 0.5) * escala) * s];

  const apice = p(0.42, 0.28);
  const esq = p(0.22, 0.68);
  const dir = p(0.62, 0.68);
  const inicioFeixe = p(0.075, 0.50);
  const entrada = p(0.310, 0.50);
  const saida = p(0.5525, 0.545);
  const espessura = 0.020 * s * escala;

  const bandas = [];
  const topo = 0.30, altura = 0.44, xFim = 0.905;
  for (let i = 0; i < ESPECTRO.length; i++) {
    bandas.push({
      cor: ESPECTRO[i],
      pontos: [saida, p(xFim, topo + (altura / ESPECTRO.length) * i), p(xFim, topo + (altura / ESPECTRO.length) * (i + 1))],
    });
  }

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const px = x + (sx + 0.5) / amostras;
          const py = y + (sy + 0.5) / amostras;
          let cor = FUNDO;

          for (const banda of bandas) {
            if (dentro(px, py, banda.pontos)) { cor = banda.cor; break; }
          }
          // feixe branco entrando e o trecho refratado dentro do prisma
          if (distSegmento(px, py, inicioFeixe, entrada) < espessura / 2) cor = FEIXE;
          else if (distSegmento(px, py, entrada, saida) < espessura / 2) cor = FEIXE;
          else {
            const d = Math.min(
              distSegmento(px, py, esq, apice),
              distSegmento(px, py, apice, dir),
              distSegmento(px, py, dir, esq),
            );
            if (d < espessura * 0.42) cor = ARESTA;
          }
          acc[0] += cor[0]; acc[1] += cor[1]; acc[2] += cor[2];
        }
      }
      const n = amostras * amostras;
      const i = (y * s + x) * 4;
      rgba[i] = Math.round(acc[0] / n);
      rgba[i + 1] = Math.round(acc[1] / n);
      rgba[i + 2] = Math.round(acc[2] / n);
      rgba[i + 3] = 255;
    }
  }
  return paraPNG(s, s, rgba);
}

mkdirSync('docs/icons', { recursive: true });
const saidas = [
  ['docs/icons/icon-192.png', 192, 1],
  ['docs/icons/icon-512.png', 512, 1],
  ['docs/icons/icon-maskable-512.png', 512, 0.62],
];
for (const [arquivo, tamanho, escala] of saidas) {
  writeFileSync(arquivo, desenhar(tamanho, escala));
  console.log(`${arquivo} — ${tamanho}x${tamanho}${escala !== 1 ? ' (zona segura)' : ''}`);
}
