const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const doc = require('./lib/documento');
const acesso = require('./lib/acesso');
const {
  Endereco, Regiao, Vendedor, Cliente, Produto, Pedido, aplicarValidadores
} = require('./models');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('query parser', 'simple');
app.use(acesso.cabecalhos);
app.use(freio);
app.use(conferirOrigem);
app.use(express.json({ limit: '80kb', strict: true }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ erro: 'Pedido grande demais.' });
  return next(err);
});
app.use(corpoJson);

function falha(mensagem, status = 400) {
  const erro = new Error(mensagem);
  erro.status = status;
  return erro;
}

function sendError(res, err) {
  if (err && err.code === 11000) {
    const campo = Object.keys(err.keyPattern || {})[0] || '';
    const mensagens = {
      cnpj: 'Já existe uma empresa com este CNPJ.',
      cpf: 'Já existe um vendedor com este CPF.',
      email: 'Já existe um vendedor com este e-mail.',
      nome_regiao: 'Já existe uma região com este nome.',
      id_regiao: 'Esta região já tem um vendedor responsável. Cada região só pode ter um.'
    };
    return res.status(409).json({ erro: mensagens[campo] || 'Este cadastro repetiria um valor que precisa ser único.' });
  }
  if (err && err.name === 'ValidationError') {
    const mensagem = Object.values(err.errors).map((item) => item.message).join(' ');
    return res.status(400).json({ erro: mensagem });
  }
  if (err && (err.name === 'CastError' || err.name === 'BSONError')) {
    return res.status(400).json({ erro: 'Identificador inválido.' });
  }
  if (err && err.code === 121) {
    return res.status(400).json({ erro: 'O banco recusou o cadastro: o formato não obedece às regras da coleção.' });
  }
  if (err && err.status && err.status < 500) {
    return res.status(err.status).json({ erro: err.message || 'Não foi possível concluir.' });
  }
  console.error(redigir(err && err.message));
  return res.status(500).json({ erro: 'Não foi possível concluir.' });
}

function redigir(texto) {
  return String(texto || 'erro').replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://***');
}

function freio(req, res, next) {
  const ip = acesso.ipDe(req);
  let ok = true;
  if (req.path === '/api/entrar') ok = acesso.limitar('entrar:' + ip, 8, 15 * 60 * 1000);
  else if (req.path.startsWith('/api/consulta-cnpj')) ok = acesso.limitar('cnpj:' + ip, 20, 60 * 1000);
  else if (req.method === 'GET' || req.method === 'HEAD') ok = acesso.limitar('ler:' + ip, 300, 60 * 1000);
  else ok = acesso.limitar('gravar:' + ip, 60, 60 * 1000);
  if (ok) return next();
  const mensagem = req.path === '/api/entrar'
    ? 'Muitas tentativas. Espere alguns minutos.'
    : 'Muitos acessos. Espere um instante.';
  return res.status(429).json({ erro: mensagem });
}

function conferirOrigem(req, res, next) {
  if (!acesso.origemPermitida(req)) return res.status(403).json({ erro: 'Origem recusada.' });
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!acesso.origemConfiavel(req)) return res.status(403).json({ erro: 'Origem recusada.' });
  next();
}

function limparEntrada(valor, profundidade) {
  if (profundidade > 6) throw falha('JSON profundo demais.');
  if (valor == null || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw falha('Número inválido.');
    return valor;
  }
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor)) {
    if (valor.length > 40) throw falha('Lista grande demais.');
    return valor.map((item) => limparEntrada(item, profundidade + 1));
  }
  if (typeof valor === 'object') {
    const saida = {};
    for (const chave of Object.keys(valor)) {
      if (chave.startsWith('$') || chave.includes('.') || chave === '__proto__' || chave === 'constructor' || chave === 'prototype') {
        throw falha('Campo inválido.');
      }
      saida[chave] = limparEntrada(valor[chave], profundidade + 1);
    }
    return saida;
  }
  throw falha('Campo inválido.');
}

function corpoJson(req, res, next) {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();
  if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie JSON.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ erro: 'Envie um objeto JSON.' });
  }
  try {
    req.body = limparEntrada(req.body, 0);
  } catch (err) {
    return sendError(res, err);
  }
  next();
}

function exigirSessao(req, res, next) {
  if (!acesso.sessaoValida(config.sessionSecret, config.senha, acesso.cookie(req, 'ca_sessao'))) {
    return res.status(401).json({ erro: 'Entre para continuar.' });
  }
  next();
}

let conexao = null;
function comTempo(promessa, ms, mensagem) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensagem)), ms);
    Promise.resolve(promessa).then((valor) => {
      clearTimeout(timer);
      resolve(valor);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
function prepararEsquema() {
  return comTempo(Promise.all([
    Endereco.syncIndexes(),
    Regiao.syncIndexes(),
    Vendedor.syncIndexes(),
    Cliente.syncIndexes(),
    Produto.syncIndexes(),
    Pedido.syncIndexes()
  ]), 20000, 'A sincronização dos índices demorou demais.').then(() => {
    return comTempo(aplicarValidadores(mongoose.connection.db), 20000, 'Os validadores do banco demoraram demais.');
  });
}
function garantirBanco() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!conexao) {
    conexao = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 }).then(() => {
      prepararEsquema().catch((err) => console.error('Aviso:', redigir(err && err.message)));
    }).catch((err) => {
      conexao = null;
      throw err;
    });
  }
  return conexao;
}

function idValido(id) {
  return mongoose.isValidObjectId(id);
}

function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function lerDataPedido(valor) {
  const match = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw falha('Informe a data do pedido.');
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const real = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  if (!real) throw falha('Data do pedido inválida.');
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  if (iso > hojeBrasil()) throw falha('A data do pedido não pode ser no futuro.');
  if (iso < '2000-01-01') throw falha('A data do pedido é antiga demais.');
  return data;
}

function lerComissao(valor) {
  const numero = doc.money(valor);
  if (numero == null || numero < 0 || numero > 100) {
    throw falha('A comissão deve ficar entre 0 e 100, com no máximo 2 casas decimais.');
  }
  return numero;
}

function lerPreco(valor) {
  const numero = doc.money(valor);
  if (numero == null || numero < 0.01 || numero > 9999999.99) {
    throw falha('Informe um preço entre R$ 0,01 e R$ 9.999.999,99, com no máximo 2 casas decimais.');
  }
  return numero;
}

function idDe(valor) {
  if (valor == null) return '';
  if (typeof valor.toHexString === 'function') return valor.toHexString();
  return String(valor);
}

function formato(doc, campoId) {
  const saida = { ...doc };
  delete saida.__v;
  const id = idDe(doc._id);
  saida[campoId] = id;
  saida.id = id;
  delete saida._id;
  for (const chave of Object.keys(saida)) {
    const valor = saida[chave];
    if (valor && typeof valor.toHexString === 'function') saida[chave] = valor.toHexString();
    if (Array.isArray(valor)) {
      saida[chave] = valor.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const copia = { ...item };
        if (copia.id_produto != null) copia.id_produto = idDe(copia.id_produto);
        delete copia._id;
        return copia;
      });
    }
  }
  return saida;
}

async function listarEnderecos() {
  const enderecos = await Endereco.find().sort({ cidade: 1, logradouro: 1 }).limit(1000).lean();
  return enderecos.map((item) => formato(item, 'id_endereco'));
}

async function listarRegioes() {
  const regioes = await Regiao.find().sort({ nome_regiao: 1 }).limit(1000).lean();
  return regioes.map((item) => formato(item, 'id_regiao'));
}

async function listarVendedores() {
  const [vendedores, enderecos, regioes] = await Promise.all([
    Vendedor.find().sort({ nome: 1 }).limit(1000).lean(),
    Endereco.find().lean(),
    Regiao.find().lean()
  ]);
  const enderecoPorId = new Map(enderecos.map((item) => [idDe(item._id), formato(item, 'id_endereco')]));
  const regiaoPorId = new Map(regioes.map((item) => [idDe(item._id), formato(item, 'id_regiao')]));
  return vendedores.map((item) => {
    const json = formato(item, 'id_vendedor');
    json.endereco = enderecoPorId.get(idDe(item.id_endereco)) || null;
    json.regiao = regiaoPorId.get(idDe(item.id_regiao)) || null;
    return json;
  });
}

async function listarClientes() {
  const [clientes, enderecos] = await Promise.all([
    Cliente.find().sort({ nome: 1 }).limit(1000).lean(),
    Endereco.find().lean()
  ]);
  const enderecoPorId = new Map(enderecos.map((item) => [idDe(item._id), formato(item, 'id_endereco')]));
  return clientes.map((item) => {
    const json = formato(item, 'id_cliente');
    json.endereco = enderecoPorId.get(idDe(item.id_endereco)) || null;
    return json;
  });
}

async function listarProdutos() {
  const produtos = await Produto.find().sort({ nome: 1 }).limit(1000).lean();
  return produtos.map((item) => formato(item, 'id_produto'));
}

function lerDiaFiltro(valor, nome) {
  if (valor == null || valor === '') return null;
  if (Array.isArray(valor) || typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw falha(nome + ' inválida. Use AAAA-MM-DD.');
  }
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(5, 7));
  const dia = Number(valor.slice(8, 10));
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  const real = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  if (!real || valor < '2000-01-01' || valor > '2100-12-31') throw falha(nome + ' inválida.');
  return data;
}

async function listarPedidos(de, ate) {
  const filtro = {};
  if (de || ate) {
    filtro.data_pedido = {};
    if (de) filtro.data_pedido.$gte = de;
    if (ate) filtro.data_pedido.$lte = ate;
  }
  const pedidos = await Pedido.find(filtro).sort({ data_pedido: -1, _id: -1 }).limit(1000).lean();
  return pedidos.map((item) => formato(item, 'id_pedido'));
}

function dadosEndereco(body) {
  return {
    cep: body.cep,
    logradouro: body.logradouro,
    numero: body.numero,
    complemento: body.complemento,
    bairro: body.bairro,
    cidade: body.cidade,
    estado: body.estado
  };
}

async function liberarEndereco(id) {
  if (!id) return;
  const empresas = await Cliente.countDocuments({ id_endereco: id });
  const vendedores = await Vendedor.countDocuments({ id_endereco: id });
  if (empresas || vendedores) return;
  await Endereco.findByIdAndDelete(id);
}

async function criarOuAtualizarEndereco(body, idAtual) {
  const dados = dadosEndereco(body);
  if (idAtual) {
    const endereco = await Endereco.findById(idAtual);
    if (!endereco) throw falha('Endereço não encontrado.', 404);
    Object.assign(endereco, dados);
    await endereco.save();
    return endereco;
  }
  return Endereco.create(dados);
}

app.post('/api/entrar', async (req, res) => {
  try {
    const ok = await acesso.senhaConfere(config.senha, req.body.senha);
    if (!ok) return res.status(401).json({ erro: 'Senha incorreta.' });
    acesso.definirSessao(res, req, config.sessionSecret, config.senha);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/sair', (req, res) => {
  acesso.limparSessao(res, req);
  res.json({ ok: true });
});

app.get('/api/health', async (req, res) => {
  try {
    await garantirBanco();
    res.json({ ok: mongoose.connection.readyState === 1 });
  } catch (err) {
    console.error(redigir(err && err.message));
    res.status(503).json({ ok: false });
  }
});

app.use('/api', exigirSessao);
app.use('/api', async (req, res, next) => {
  try {
    await garantirBanco();
    next();
  } catch (err) {
    console.error(redigir(err && err.message));
    res.status(503).json({ erro: 'Banco indisponível.' });
  }
});

app.get('/api/sessao', (req, res) => {
  res.json({ ok: true });
});

function resumir(lista) {
  const texto = JSON.stringify(lista, (_chave, valor) => {
    if (valor && typeof valor.toHexString === 'function') return valor.toHexString();
    if (valor instanceof Date) return valor.toISOString();
    return valor;
  });
  return crypto.createHash('sha256').update(texto).digest('base64url').slice(0, 16);
}

app.get('/api/versao', async (req, res) => {
  try {
    const [enderecos, regioes, vendedores, clientes, produtos, pedidos] = await Promise.all([
      Endereco.find().select('cep logradouro numero complemento bairro cidade estado').sort({ _id: 1 }).lean(),
      Regiao.find().select('nome_regiao').sort({ _id: 1 }).lean(),
      Vendedor.find().select('nome cpf telefone email id_endereco id_regiao').sort({ _id: 1 }).lean(),
      Cliente.find().select('nome cnpj telefone id_endereco').sort({ _id: 1 }).lean(),
      Produto.find().select('nome descricao preco').sort({ _id: 1 }).lean(),
      Pedido.find().select('data_pedido perc_comissao id_cliente id_vendedor itens').sort({ _id: 1 }).lean()
    ]);
    res.json({ v: [enderecos, regioes, vendedores, clientes, produtos, pedidos].map(resumir).join('.') });
  } catch (err) { sendError(res, err); }
});

app.get('/api/consulta-cnpj/:cnpj', async (req, res) => {
  try {
    const cnpj = doc.onlyDigits(req.params.cnpj);
    if (!doc.cnpjValido(cnpj)) throw falha('CNPJ inválido.');
    let resposta;
    try {
      resposta = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, {
        headers: { Accept: 'application/json', 'User-Agent': 'central-de-ar' },
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw falha('A consulta pública do CNPJ não respondeu. Preencha os dados manualmente.', 502);
    }
    if (resposta.status === 404) throw falha('CNPJ não encontrado no cadastro público.', 404);
    if (!resposta.ok) throw falha('A consulta pública do CNPJ não respondeu. Preencha os dados manualmente.', 502);
    const tipo = resposta.headers.get('content-type') || '';
    if (!tipo.includes('json')) throw falha('A consulta pública do CNPJ não respondeu. Preencha os dados manualmente.', 502);
    const bruto = await resposta.text();
    if (bruto.length > 1000000) throw falha('A consulta pública do CNPJ não respondeu. Preencha os dados manualmente.', 502);
    let dados;
    try { dados = JSON.parse(bruto); }
    catch { throw falha('A consulta pública do CNPJ não respondeu. Preencha os dados manualmente.', 502); }
    const telefone = doc.onlyDigits(dados.ddd_telefone_1);
    res.json({
      nome: doc.cleanName(dados.razao_social || dados.nome_fantasia || '').slice(0, 100),
      telefone: telefone.length === 11 && telefone[2] === '9' ? telefone : '',
      cep: doc.onlyDigits(dados.cep).slice(0, 8),
      logradouro: doc.cleanName(dados.logradouro || '').slice(0, 120),
      numero: String(dados.numero || '').trim().slice(0, 10),
      complemento: doc.cleanName(dados.complemento || '').slice(0, 50),
      bairro: doc.cleanName(dados.bairro || '').slice(0, 60),
      cidade: doc.cleanName(dados.municipio || '').slice(0, 60),
      estado: String(dados.uf || '').trim().toUpperCase()
    });
  } catch (err) { sendError(res, err); }
});

app.get('/api/enderecos', async (req, res) => {
  try { res.json(await listarEnderecos()); } catch (err) { sendError(res, err); }
});

app.post('/api/enderecos', async (req, res) => {
  try {
    const endereco = await Endereco.create(dadosEndereco(req.body));
    res.status(201).json({ id_endereco: endereco.id, mensagem: 'Endereço cadastrado.' });
  } catch (err) { sendError(res, err); }
});

app.put('/api/enderecos/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Endereço inválido.');
    await criarOuAtualizarEndereco(req.body, req.params.id);
    res.json({ mensagem: 'Endereço atualizado.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/enderecos/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Endereço inválido.');
    const endereco = await Endereco.findById(req.params.id);
    if (!endereco) throw falha('Endereço não encontrado.', 404);
    const empresas = await Cliente.countDocuments({ id_endereco: endereco._id });
    const vendedores = await Vendedor.countDocuments({ id_endereco: endereco._id });
    if (empresas || vendedores) {
      throw falha('Este endereço está em uso. Altere o cadastro que o usa antes de apagar.', 409);
    }
    await endereco.deleteOne();
    res.json({ mensagem: 'Endereço removido.' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/regioes', async (req, res) => {
  try { res.json(await listarRegioes()); } catch (err) { sendError(res, err); }
});

app.post('/api/regioes', async (req, res) => {
  try {
    const regiao = await Regiao.create({ nome_regiao: req.body.nome_regiao });
    res.status(201).json({ id_regiao: regiao.id, mensagem: 'Região cadastrada.' });
  } catch (err) { sendError(res, err); }
});

app.put('/api/regioes/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Região inválida.');
    const regiao = await Regiao.findById(req.params.id);
    if (!regiao) throw falha('Região não encontrada.', 404);
    regiao.nome_regiao = req.body.nome_regiao;
    await regiao.save();
    res.json({ mensagem: 'Região atualizada.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/regioes/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Região inválida.');
    const regiao = await Regiao.findById(req.params.id);
    if (!regiao) throw falha('Região não encontrada.', 404);
    const vendedores = await Vendedor.countDocuments({ id_regiao: regiao._id });
    if (vendedores) throw falha('Esta região tem um vendedor. Escolha outra região para ele antes de apagar.', 409);
    await regiao.deleteOne();
    res.json({ mensagem: 'Região removida.' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/vendedores', async (req, res) => {
  try { res.json(await listarVendedores()); } catch (err) { sendError(res, err); }
});

app.post('/api/vendedores', async (req, res) => {
  try {
    if (!idValido(req.body.id_regiao)) throw falha('Escolha a região do vendedor.');
    const regiao = await Regiao.findById(req.body.id_regiao);
    if (!regiao) throw falha('Região não encontrada.', 404);
    const endereco = await criarOuAtualizarEndereco(req.body, null);
    try {
      await Vendedor.create({
        nome: req.body.nome,
        cpf: req.body.cpf,
        telefone: req.body.telefone,
        email: req.body.email,
        id_endereco: endereco._id,
        id_regiao: regiao._id
      });
    } catch (err) {
      await Endereco.findByIdAndDelete(endereco._id);
      throw err;
    }
    res.status(201).json({ mensagem: 'Vendedor cadastrado.' });
  } catch (err) { sendError(res, err); }
});

app.put('/api/vendedores/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Vendedor inválido.');
    const vendedor = await Vendedor.findById(req.params.id);
    if (!vendedor) throw falha('Vendedor não encontrado.', 404);
    if (!idValido(req.body.id_regiao)) throw falha('Escolha a região do vendedor.');
    const regiao = await Regiao.findById(req.body.id_regiao);
    if (!regiao) throw falha('Região não encontrada.', 404);
    await criarOuAtualizarEndereco(req.body, vendedor.id_endereco);
    vendedor.nome = req.body.nome;
    vendedor.cpf = req.body.cpf;
    vendedor.telefone = req.body.telefone;
    vendedor.email = req.body.email;
    vendedor.id_regiao = regiao._id;
    await vendedor.save();
    res.json({ mensagem: 'Vendedor atualizado.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/vendedores/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Vendedor inválido.');
    const vendedor = await Vendedor.findById(req.params.id);
    if (!vendedor) throw falha('Vendedor não encontrado.', 404);
    const pedidos = await Pedido.countDocuments({ id_vendedor: vendedor._id });
    if (pedidos) throw falha('Este vendedor tem pedidos. Apague esses pedidos antes, para a comissão não sumir sem querer.', 409);
    const enderecoId = vendedor.id_endereco;
    await vendedor.deleteOne();
    await liberarEndereco(enderecoId);
    res.json({ mensagem: 'Vendedor removido.' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/clientes', async (req, res) => {
  try { res.json(await listarClientes()); } catch (err) { sendError(res, err); }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const endereco = await criarOuAtualizarEndereco(req.body, null);
    try {
      await Cliente.create({
        nome: req.body.nome,
        cnpj: req.body.cnpj,
        telefone: req.body.telefone,
        id_endereco: endereco._id
      });
    } catch (err) {
      await Endereco.findByIdAndDelete(endereco._id);
      throw err;
    }
    res.status(201).json({ mensagem: 'Empresa cadastrada.' });
  } catch (err) { sendError(res, err); }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Empresa inválida.');
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) throw falha('Empresa não encontrada.', 404);
    await criarOuAtualizarEndereco(req.body, cliente.id_endereco);
    cliente.nome = req.body.nome;
    cliente.cnpj = req.body.cnpj;
    cliente.telefone = req.body.telefone;
    await cliente.save();
    res.json({ mensagem: 'Empresa atualizada.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Empresa inválida.');
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) throw falha('Empresa não encontrada.', 404);
    const pedidos = await Pedido.countDocuments({ id_cliente: cliente._id });
    if (pedidos) throw falha('Esta empresa tem pedidos. Apague esses pedidos antes, para o histórico não sumir sem querer.', 409);
    const enderecoId = cliente.id_endereco;
    await cliente.deleteOne();
    await liberarEndereco(enderecoId);
    res.json({ mensagem: 'Empresa removida.' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/produtos', async (req, res) => {
  try { res.json(await listarProdutos()); } catch (err) { sendError(res, err); }
});

app.post('/api/produtos', async (req, res) => {
  try {
    await Produto.create({
      nome: req.body.nome,
      descricao: req.body.descricao || '',
      preco: lerPreco(req.body.preco)
    });
    res.status(201).json({ mensagem: 'Produto cadastrado.' });
  } catch (err) { sendError(res, err); }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Produto inválido.');
    const produto = await Produto.findById(req.params.id);
    if (!produto) throw falha('Produto não encontrado.', 404);
    produto.nome = req.body.nome;
    produto.descricao = req.body.descricao || '';
    produto.preco = lerPreco(req.body.preco);
    await produto.save();
    res.json({ mensagem: 'Produto atualizado.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Produto inválido.');
    const produto = await Produto.findById(req.params.id);
    if (!produto) throw falha('Produto não encontrado.', 404);
    const pedidos = await Pedido.countDocuments({ 'itens.id_produto': produto._id });
    if (pedidos) throw falha('Este produto está em pedidos. O histórico de vendas precisa continuar, então ele não pode ser apagado.', 409);
    await produto.deleteOne();
    res.json({ mensagem: 'Produto removido.' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/pedidos', async (req, res) => {
  try {
    const de = lerDiaFiltro(req.query.de, 'Data inicial');
    const ate = lerDiaFiltro(req.query.ate, 'Data final');
    if (de && ate && de > ate) throw falha('A data inicial está depois da final.');
    res.json(await listarPedidos(de, ate));
  } catch (err) { sendError(res, err); }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    if (!idValido(req.body.id_cliente)) throw falha('Escolha a empresa do pedido.');
    if (!idValido(req.body.id_vendedor)) throw falha('Escolha o vendedor do pedido.');
    const cliente = await Cliente.findById(req.body.id_cliente);
    const vendedor = await Vendedor.findById(req.body.id_vendedor);
    if (!cliente) throw falha('Empresa não encontrada.', 404);
    if (!vendedor) throw falha('Vendedor não encontrado.', 404);
    if (!Array.isArray(req.body.itens) || req.body.itens.length === 0) {
      throw falha('Inclua pelo menos um produto no pedido.');
    }
    if (req.body.itens.length > 30) throw falha('Um pedido pode ter no máximo 30 linhas.');

    const vistos = new Set();
    const itens = [];
    for (const item of req.body.itens) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw falha('Há um produto inválido no pedido.');
      if (!idValido(item.id_produto)) throw falha('Há um produto inválido no pedido.');
      const chave = String(item.id_produto);
      if (vistos.has(chave)) throw falha('Não repita o mesmo produto. Aumente a quantidade na linha que já existe.');
      vistos.add(chave);
      const produto = await Produto.findById(item.id_produto);
      if (!produto) throw falha('Um dos produtos não existe mais.');
      const quantidade = Number(item.quantidade);
      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 9999) {
        throw falha('A quantidade de cada produto deve ser um inteiro de 1 a 9999.');
      }
      itens.push({
        id_produto: produto._id,
        quantidade,
        preco_unitario: produto.preco
      });
    }

    const pedido = await Pedido.create({
      data_pedido: lerDataPedido(req.body.data_pedido),
      perc_comissao: lerComissao(req.body.perc_comissao),
      id_cliente: cliente._id,
      id_vendedor: vendedor._id,
      itens
    });
    res.status(201).json({ id_pedido: pedido.id, mensagem: 'Pedido registrado.' });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/pedidos/:id', async (req, res) => {
  try {
    if (!idValido(req.params.id)) throw falha('Pedido inválido.');
    const pedido = await Pedido.findById(req.params.id);
    if (!pedido) throw falha('Pedido não encontrado.', 404);
    await pedido.deleteOne();
    res.json({ mensagem: 'Pedido removido.' });
  } catch (err) { sendError(res, err); }
});

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'frontend.html'));
});

function tentarBanco() {
  garantirBanco().then(() => {
    console.log('Conectado ao MongoDB.');
  }).catch((err) => {
    console.error('Banco indisponível:', redigir(err && err.message));
    console.error('O site continua no ar. Nova tentativa em 5 segundos.');
    setTimeout(tentarBanco, 5000);
  });
}

function iniciar() {
  const servidor = app.listen(config.port, () => {
    console.log(`Servidor na porta ${config.port}`);
    console.log('Abrindo o banco...');
  });
  servidor.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`A porta ${config.port} já está em uso. Feche a outra janela do servidor e rode npm start de novo.`);
    } else {
      console.error('Falha ao abrir a porta:', err.message);
    }
    process.exit(1);
  });
  tentarBanco();
}

if (require.main === module) {
  iniciar();
}

module.exports = app;
