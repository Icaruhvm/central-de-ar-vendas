const mongoose = require('mongoose');
const config = require('../config');
const doc = require('../lib/documento');
const { Endereco, Regiao, Vendedor, Cliente, Produto, Pedido, aplicarValidadores } = require('../models');

const LEGADAS = [
  'cliente', 'clientes', 'endereco', 'enderecos', 'vendedor', 'vendedors',
  'regiao', 'regiaos', 'produto', 'produtos', 'pedido', 'pedidos', 'item_pedido', 'test'
];

function afirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function dropar(db, nome) {
  try {
    await db.collection(nome).drop();
    return true;
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound') return false;
    throw err;
  }
}

async function esperaFalha(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

async function main() {
  afirmar(doc.cnpjValido('12.345.678/0001-95'), 'CNPJ de exemplo inválido.');
  afirmar(!doc.cnpjValido('12.345.678/0001-99'), 'O CNPJ antigo não deveria passar.');
  afirmar(doc.cpfValido('390.533.447-05'), 'CPF de exemplo inválido.');
  afirmar(doc.telefoneValido('(27) 99991-1111'), 'Celular do vendedor inválido.');
  afirmar(doc.telefoneValido('(27) 98888-1000'), 'Celular da empresa inválido.');
  afirmar(!doc.telefoneValido('(27) 3333-1111'), 'Telefone fixo passou.');

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log('Conectado ao banco', db.databaseName);

  const removidas = [];
  for (const nome of LEGADAS) {
    if (await dropar(db, nome)) removidas.push(nome);
  }
  console.log('Coleções recriadas do zero:', removidas.join(', ') || 'nenhuma');

  await aplicarValidadores(db);
  await Promise.all([
    Endereco.syncIndexes(),
    Regiao.syncIndexes(),
    Vendedor.syncIndexes(),
    Cliente.syncIndexes(),
    Produto.syncIndexes(),
    Pedido.syncIndexes()
  ]);

  const regioes = {};
  for (const nome of ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Viana', 'Guarapari', 'Fundão']) {
    regioes[nome] = await Regiao.create({ nome_regiao: nome });
  }

  const split = await Produto.create({
    nome: 'Ar Condicionado Split 12000 BTUs Inverter',
    descricao: 'Gás R32 e serpentina de cobre.',
    preco: 2350
  });
  const cassete = await Produto.create({
    nome: 'Ar Condicionado Cassete 36000 BTUs',
    descricao: 'Para salões comerciais, 220V.',
    preco: 7100
  });

  const enderecoVendedor = await Endereco.create({
    cep: '29101-350',
    logradouro: 'Av. Champagnat',
    numero: '100',
    complemento: null,
    bairro: 'Praia da Costa',
    cidade: 'Vila Velha',
    estado: 'ES'
  });
  const enderecoCliente = await Endereco.create({
    cep: '29055-260',
    logradouro: 'Rua da Penha',
    numero: '200',
    complemento: 'Loja 1',
    bairro: 'Praia do Canto',
    cidade: 'Vitória',
    estado: 'ES'
  });

  const vendedor = await Vendedor.create({
    nome: 'Mário Fernandes',
    cpf: '390.533.447-05',
    telefone: '(27) 99991-1111',
    email: 'mario@refrigeracao.com',
    id_endereco: enderecoVendedor._id,
    id_regiao: regioes['Vila Velha']._id
  });
  const cliente = await Cliente.create({
    nome: 'Supermercado Central',
    cnpj: '12.345.678/0001-95',
    telefone: '(27) 98888-1000',
    id_endereco: enderecoCliente._id
  });

  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 9, 1, 12, 0, 0)),
    perc_comissao: 5,
    id_cliente: cliente._id,
    id_vendedor: vendedor._id,
    itens: [{ id_produto: split._id, quantidade: 2, preco_unitario: split.preco }]
  });
  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 10, 2, 12, 0, 0)),
    perc_comissao: 4,
    id_cliente: cliente._id,
    id_vendedor: vendedor._id,
    itens: [{ id_produto: cassete._id, quantidade: 1, preco_unitario: cassete.preco }]
  });

  const duplicado = await esperaFalha(() => mongoose.connection.collection('cliente').insertOne({
    nome: 'Copia Indevida',
    cnpj: cliente.cnpj,
    telefone: '(27) 98888-2000',
    id_endereco: enderecoCliente._id
  }));
  afirmar(duplicado && duplicado.code === 11000, 'O banco aceitou um CNPJ repetido.');

  const telefoneGigante = await esperaFalha(() => mongoose.connection.collection('cliente').insertOne({
    nome: 'Telefone Gigante Ltda',
    cnpj: '11.444.777/0001-61',
    telefone: '9'.repeat(40),
    id_endereco: enderecoCliente._id
  }));
  afirmar(telefoneGigante && telefoneGigante.code === 121, 'O banco aceitou um telefone com tamanho inválido.');

  const cnpjCurto = await esperaFalha(() => Cliente.create({
    nome: 'CNPJ Curto Ltda',
    cnpj: '123',
    telefone: '(27) 98888-3000',
    id_endereco: enderecoCliente._id
  }));
  afirmar(cnpjCurto && cnpjCurto.name === 'ValidationError', 'A API aceitou um CNPJ curto.');

  const fixo = await esperaFalha(() => Cliente.create({
    nome: 'Telefone Fixo Ltda',
    cnpj: '11222333000181',
    telefone: '(27) 3333-1111',
    id_endereco: enderecoCliente._id
  }));
  afirmar(fixo && fixo.name === 'ValidationError', 'A API aceitou telefone fixo.');

  const mesmaRegiao = await esperaFalha(() => Vendedor.create({
    nome: 'Outro Vendedor',
    cpf: '529.982.247-25',
    telefone: '(27) 98888-4000',
    email: 'outro@refrigeracao.com',
    id_endereco: enderecoVendedor._id,
    id_regiao: regioes['Vila Velha']._id
  }));
  afirmar(mesmaRegiao && mesmaRegiao.code === 11000, 'A mesma região aceitou dois vendedores.');

  const salvo = await Cliente.findById(cliente._id);
  afirmar(salvo.cnpj.length === 18, 'CNPJ salvo sem 18 caracteres.');
  afirmar(salvo.telefone.length === 15, 'Celular salvo sem 15 caracteres.');
  afirmar((await Cliente.countDocuments()) === 1, 'Ficou cliente de teste indevido.');
  afirmar((await Regiao.countDocuments()) === 7, 'Regiões incompletas.');
  afirmar((await Pedido.countDocuments()) === 2, 'Pedidos de exemplo ausentes.');

  const nomes = (await db.listCollections().toArray()).map((item) => item.name).sort();
  console.log('Coleções finais:', nomes.join(', '));
  console.log('CNPJ único com 18 caracteres, celular com 15, uma região por vendedor.');
  console.log('Banco recusou CNPJ duplicado, telefone gigante, CNPJ curto, telefone fixo e região repetida.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Falha ao alinhar o banco:', err.message);
  try { await mongoose.disconnect(); } catch (_) { /* conexão já encerrada */ }
  process.exit(1);
});
