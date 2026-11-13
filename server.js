const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');
const doc = require('./lib/documento');
const {
  Endereco, Regiao, Vendedor, Cliente, Produto, Pedido, aplicarValidadores
} = require('./models');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

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
  const status = err && err.status ? err.status : 400;
  return res.status(status).json({ erro: (err && err.message) || 'Não foi possível concluir.' });
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
  const enderecos = await Endereco.find().sort({ cidade: 1, logradouro: 1 }).lean();
  return enderecos.map((item) => formato(item, 'id_endereco'));
}

async function listarRegioes() {
  const regioes = await Regiao.find().sort({ nome_regiao: 1 }).lean();
  return regioes.map((item) => formato(item, 'id_regiao'));
}

async function listarVendedores() {
  const [vendedores, enderecos, regioes] = await Promise.all([
    Vendedor.find().sort({ nome: 1 }).lean(),
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
    Cliente.find().sort({ nome: 1 }).lean(),
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
  const produtos = await Produto.find().sort({ nome: 1 }).lean();
  return produtos.map((item) => formato(item, 'id_produto'));
}

async function listarPedidos() {
  const pedidos = await Pedido.find().sort({ data_pedido: -1, _id: -1 }).lean();
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

app.get('/api/health', (req, res) => {
  const conectado = mongoose.connection.readyState === 1;
  res.status(conectado ? 200 : 503).json({ ok: conectado });
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
    await vendedor.deleteOne();
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
    await cliente.deleteOne();
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
  try { res.json(await listarPedidos()); } catch (err) { sendError(res, err); }
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
  res.sendFile(path.join(__dirname, 'frontend.html'));
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

async function iniciar() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  await Promise.all([
    Endereco.syncIndexes(),
    Regiao.syncIndexes(),
    Vendedor.syncIndexes(),
    Cliente.syncIndexes(),
    Produto.syncIndexes(),
    Pedido.syncIndexes()
  ]);
  await aplicarValidadores(mongoose.connection.db);
  app.listen(config.port, () => {
    console.log(`Servidor Backend rodando na porta ${config.port}`);
    console.log('Conectado ao MongoDB com sucesso!');
  });
}

iniciar().catch((err) => {
  console.error('Falha ao iniciar:', err.message);
  process.exit(1);
});
