const crypto = require('crypto');

const baldes = new Map();

function limitar(chave, maximo, janelaMs) {
  const agora = Date.now();
  let item = baldes.get(chave);
  if (!item || agora - item.inicio >= janelaMs) {
    item = { inicio: agora, n: 0 };
    baldes.set(chave, item);
  }
  item.n += 1;
  if (baldes.size > 8000) {
    for (const [nome, valor] of baldes) {
      if (agora - valor.inicio >= janelaMs) baldes.delete(nome);
      if (baldes.size <= 6000) break;
    }
  }
  return item.n <= maximo;
}

function cookie(req, nome) {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nome) continue;
    try { return decodeURIComponent(parte.slice(i + 1).trim()); }
    catch { return ''; }
  }
  return '';
}

function marcaSenha(senha) {
  return crypto.createHash('sha256').update(String(senha), 'utf8').digest('base64url');
}

function sessaoValida(segredo, senha, token) {
  if (typeof token !== 'string') return false;
  const ponto = token.indexOf('.');
  if (ponto < 1) return false;
  const corpo = token.slice(0, ponto);
  const mac = token.slice(ponto + 1);
  if (!/^\d{13}$/.test(corpo) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return false;
  const esperada = crypto.createHmac('sha256', segredo).update(corpo + '|' + marcaSenha(senha)).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(corpo) > Date.now();
}

function derivarSenha(senha) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(senha), 'central-de-ar-login-v1', 32, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    }, (err, chave) => {
      if (err) reject(err);
      else resolve(chave);
    });
  });
}

async function senhaConfere(esperada, informada) {
  const tentativa = typeof informada === 'string' && informada.length >= 1 && informada.length <= 200
    ? informada
    : '\u0000';
  const [correta, recebida] = await Promise.all([
    derivarSenha(esperada),
    derivarSenha(tentativa)
  ]);
  return tentativa === informada && crypto.timingSafeEqual(correta, recebida);
}

function ipDe(req) {
  return req.ip || req.socket.remoteAddress || 'local';
}

function emHttps(req) {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

function definirSessao(res, req, segredo, senha) {
  const expira = Date.now() + 8 * 60 * 60 * 1000;
  const mac = crypto.createHmac('sha256', segredo).update(String(expira) + '|' + marcaSenha(senha)).digest('base64url');
  const seguro = emHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ca_sessao=${expira}.${mac}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${seguro}`);
}

function limparSessao(res, req) {
  const seguro = emHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ca_sessao=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${seguro}`);
}

const ORIGEM_OFICIAL = 'https://central-de-ar.vercel.app';

function origemPermitida(req) {
  const origem = req.headers.origin;
  if (!origem) return true;
  if (origem === ORIGEM_OFICIAL) return true;
  try {
    return new URL(origem).host === req.get('host');
  } catch {
    return false;
  }
}

function origemConfiavel(req) {
  return Boolean(req.headers.origin) && origemPermitida(req);
}

function cabecalhos(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://viacep.com.br",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (emHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
}

module.exports = {
  limitar,
  cookie,
  sessaoValida,
  senhaConfere,
  ipDe,
  definirSessao,
  limparSessao,
  origemConfiavel,
  origemPermitida,
  cabecalhos,
  ORIGEM_OFICIAL
};
