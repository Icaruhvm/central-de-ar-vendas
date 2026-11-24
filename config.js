const fs = require('fs');
const path = require('path');

function carregarEnv() {
  const arquivo = path.join(__dirname, '.env');
  if (!fs.existsSync(arquivo)) return;
  const texto = fs.readFileSync(arquivo, 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const separador = limpa.indexOf('=');
    if (separador <= 0) continue;
    const chave = limpa.slice(0, separador).trim();
    let valor = limpa.slice(separador + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[chave] == null || process.env[chave] === '') {
      process.env[chave] = valor;
    }
  }
}

carregarEnv();

function exigir(nome, minimo) {
  const valor = process.env[nome] || '';
  if (valor.length < minimo) {
    console.error(`Defina ${nome} no ambiente ou no .env, com pelo menos ${minimo} caracteres.`);
    process.exit(1);
  }
  return valor;
}

module.exports = {
  mongoUri: exigir('MONGO_URI', 12),
  senha: exigir('APP_PASSWORD', 8),
  sessionSecret: exigir('SESSION_SECRET', 32),
  port: Number(process.env.PORT) || 3000
};
