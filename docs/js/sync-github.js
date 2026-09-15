// Sincronizacao com um repositorio privado no GitHub, via Contents API.
//
// O token fica apenas no aparelho (localStorage) e so viaja para
// api.github.com. Use um token fine-grained com acesso a UM repositorio e
// permissao Contents: Read and write -- se vazar, o estrago para ai.
//
// Estrategia: ler o arquivo remoto, mesclar com o local por carimbo de tempo,
// gravar de volta usando o `sha` lido. Se alguem gravou nesse meio-tempo o
// GitHub devolve 409 e a gente refaz a leitura e a mesclagem uma vez.

import { mesclar, paraSincronizar, marcarPendencia, agora } from './store.js';

const API = 'https://api.github.com';

const cabecalhos = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

// btoa/atob quebram com acento; passar por UTF-8 antes.
function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function deBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class ErroSync extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

function traduzir(status, corpo) {
  const detalhe = corpo?.message || '';
  switch (status) {
    case 401:
      return new ErroSync('token', 'Token recusado. Ele pode ter expirado ou sido revogado — gere outro em Settings > Developer settings.');
    case 403:
      return /rate limit/i.test(detalhe)
        ? new ErroSync('limite', 'Limite de requisicoes do GitHub atingido. Tente de novo em alguns minutos.')
        : new ErroSync('permissao', 'O token nao tem permissao de escrita neste repositorio. Confira se marcou Contents: Read and write.');
    case 404:
      return new ErroSync('repo', 'Repositorio ou caminho nao encontrado. Confira o nome no formato usuario/repositorio e se o token inclui esse repositorio.');
    case 409:
      return new ErroSync('conflito', 'O arquivo mudou durante o envio.');
    case 422:
      return new ErroSync('invalido', `O GitHub recusou a gravacao: ${detalhe}`);
    default:
      return new ErroSync('rede', `Falha na comunicacao com o GitHub (${status}). ${detalhe}`);
  }
}

async function pedir(url, token, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, { ...opcoes, headers: { ...cabecalhos(token), ...(opcoes.headers || {}) } });
  } catch {
    throw new ErroSync('offline', 'Sem conexao. As alteracoes ficam guardadas no aparelho e sobem sozinhas depois.');
  }
  if (resposta.status === 404) return { status: 404, dados: null };
  if (!resposta.ok) {
    let corpo = null;
    try { corpo = await resposta.json(); } catch { /* corpo vazio */ }
    throw traduzir(resposta.status, corpo);
  }
  return { status: resposta.status, dados: await resposta.json() };
}

/** Confere token, repositorio e permissao de escrita antes de confiar neles. */
export async function testarConexao({ repo, token }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) {
    throw new ErroSync('invalido', 'Informe o repositorio no formato usuario/repositorio.');
  }
  if (!token) throw new ErroSync('token', 'Cole o token gerado no GitHub.');

  const { dados } = await pedir(`${API}/repos/${repo}`, token);
  if (!dados) throw new ErroSync('repo', 'Repositorio nao encontrado, ou o token nao o inclui.');
  if (!dados.permissions?.push) {
    throw new ErroSync('permissao', 'O token consegue ler, mas nao gravar. Marque Contents: Read and write.');
  }
  return {
    repo: dados.full_name,
    privado: dados.private,
    branch: dados.default_branch,
    aviso: dados.private ? null : 'Atencao: este repositorio e publico. Seus dados financeiros ficariam visiveis para qualquer pessoa.',
  };
}

async function lerRemoto({ repo, caminho, branch, token }) {
  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(caminho)}?ref=${encodeURIComponent(branch)}`;
  const { status, dados } = await pedir(url, token);
  if (status === 404 || !dados) return { conteudo: null, sha: null };
  if (dados.content == null) {
    throw new ErroSync('invalido', 'O arquivo de dados ficou grande demais para a API de conteudo do GitHub.');
  }
  let conteudo = null;
  try {
    conteudo = JSON.parse(deBase64(dados.content));
  } catch {
    throw new ErroSync('invalido', 'O arquivo no repositorio nao e um JSON valido. Renomeie-o e sincronize de novo para recomecar.');
  }
  return { conteudo, sha: dados.sha };
}

async function gravarRemoto({ repo, caminho, branch, token }, objeto, sha, mensagem) {
  const url = `${API}/repos/${repo}/contents/${encodeURIComponent(caminho)}`;
  const corpo = {
    message: mensagem,
    content: paraBase64(JSON.stringify(objeto, null, 2)),
    branch,
  };
  if (sha) corpo.sha = sha;
  const { dados } = await pedir(url, token, { method: 'PUT', body: JSON.stringify(corpo) });
  return dados.content.sha;
}

/**
 * Uma rodada completa: le, mescla, grava se houver diferenca.
 * Devolve o estado ja mesclado -- quem chamou deve adota-lo e salvar.
 */
export async function sincronizar(estadoLocal, token, { forcar = false } = {}) {
  const cfg = {
    repo: estadoLocal.sync.repo,
    caminho: estadoLocal.sync.caminho || 'dados.json',
    branch: estadoLocal.sync.branch || 'main',
    token,
  };
  if (!cfg.repo || !token) throw new ErroSync('config', 'Sincronizacao ainda nao configurada.');

  let tentativa = 0;
  while (true) {
    const { conteudo, sha } = await lerRemoto(cfg);
    const mesclado = mesclar(estadoLocal, conteudo);
    const carga = paraSincronizar(mesclado);

    const igual = conteudo && JSON.stringify({ ...conteudo, exportadoEm: 0 }) === JSON.stringify({ ...carga, exportadoEm: 0 });
    if (igual && !forcar) {
      mesclado.sync = { ...estadoLocal.sync, ultimoSha: sha, ultimaSync: agora() };
      marcarPendencia(false);
      return { estado: mesclado, enviou: false };
    }

    try {
      const n = mesclado.lancamentos.filter((l) => !l.deleted).length;
      const novoSha = await gravarRemoto(cfg, carga, sha, `dados: ${n} lancamentos — ${new Date().toLocaleString('pt-BR')}`);
      mesclado.sync = { ...estadoLocal.sync, ultimoSha: novoSha, ultimaSync: agora() };
      marcarPendencia(false);
      return { estado: mesclado, enviou: true };
    } catch (e) {
      // outro aparelho gravou entre a leitura e o envio: reler e mesclar de novo
      if (e.codigo === 'conflito' && tentativa < 1) { tentativa++; continue; }
      throw e;
    }
  }
}
