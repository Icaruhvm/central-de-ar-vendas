const mongoose = require('mongoose');
const config = require('../config');
const doc = require('../lib/documento');
const { Endereco, Regiao, Vendedor, Cliente, Produto, Pedido, aplicarValidadores } = require('../models');

function digito(base, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpj(base12) {
  const d1 = digito(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return doc.formatCNPJ(base12 + String(d1) + String(d2));
}

function cpf(base9) {
  const d1 = digito(base9, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(base9 + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return doc.formatCPF(base9 + String(d1) + String(d2));
}

async function limpar(Model) {
  await Model.collection.deleteMany({});
}

async function main() {
  const documentos = {
    mario: cpf('390533447'),
    ana: cpf('529982247'),
    carlos: cpf('153509460'),
    juliana: cpf('847362915'),
    pedro: cpf('286413570')
  };
  const empresas = {
    mercado: cnpj('123456780001'),
    hotel: cnpj('334455660001'),
    clinica: cnpj('445566770001'),
    escola: cnpj('556677880001'),
    restaurante: cnpj('667788990001'),
    farmacia: cnpj('778899000001')
  };
  Object.values(documentos).forEach((valor) => {
    if (!doc.cpfValido(valor)) throw new Error('CPF inválido: ' + valor);
  });
  Object.values(empresas).forEach((valor) => {
    if (!doc.cnpjValido(valor)) throw new Error('CNPJ inválido: ' + valor);
  });

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  await Promise.all([Pedido, Cliente, Vendedor, Endereco, Produto, Regiao].map(limpar));
  await aplicarValidadores(mongoose.connection.db);

  const nomesRegiao = ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Viana', 'Guarapari', 'Fundão'];
  const regioes = {};
  for (const nome of nomesRegiao) regioes[nome] = await Regiao.create({ nome_regiao: nome });

  async function endereco(dados) {
    return Endereco.create(dados);
  }

  const endMario = await endereco({ cep: '29101-350', logradouro: 'Av. Champagnat', numero: '100', complemento: null, bairro: 'Praia da Costa', cidade: 'Vila Velha', estado: 'ES' });
  const endAna = await endereco({ cep: '29055-260', logradouro: 'Rua João da Cruz', numero: '45', complemento: 'Sala 2', bairro: 'Praia do Canto', cidade: 'Vitória', estado: 'ES' });
  const endCarlos = await endereco({ cep: '29165-680', logradouro: 'Av. Talma Rodrigues Ribeiro', numero: '1200', complemento: null, bairro: 'Laranjeiras', cidade: 'Serra', estado: 'ES' });
  const endJuliana = await endereco({ cep: '29151-020', logradouro: 'Av. Mário Gurgel', numero: '500', complemento: null, bairro: 'Alto Laje', cidade: 'Cariacica', estado: 'ES' });
  const endPedro = await endereco({ cep: '29200-310', logradouro: 'Av. Dr. Roberto Calmon', numero: '80', complemento: null, bairro: 'Centro', cidade: 'Guarapari', estado: 'ES' });

  const vendedores = {
    'Vila Velha': await Vendedor.create({ nome: 'Mário Fernandes', cpf: documentos.mario, telefone: '(27) 99991-1111', email: 'mario@refrigeracao.com', id_endereco: endMario._id, id_regiao: regioes['Vila Velha']._id }),
    'Vitória': await Vendedor.create({ nome: 'Ana Costa', cpf: documentos.ana, telefone: '(27) 98812-3344', email: 'ana.costa@refrigeracao.com', id_endereco: endAna._id, id_regiao: regioes['Vitória']._id }),
    'Serra': await Vendedor.create({ nome: 'Carlos Mendes', cpf: documentos.carlos, telefone: '(27) 99720-4410', email: 'carlos.mendes@refrigeracao.com', id_endereco: endCarlos._id, id_regiao: regioes.Serra._id }),
    'Cariacica': await Vendedor.create({ nome: 'Juliana Pires', cpf: documentos.juliana, telefone: '(27) 98845-2201', email: 'juliana.pires@refrigeracao.com', id_endereco: endJuliana._id, id_regiao: regioes.Cariacica._id }),
    'Guarapari': await Vendedor.create({ nome: 'Pedro Nascimento', cpf: documentos.pedro, telefone: '(28) 99910-7788', email: 'pedro.nascimento@refrigeracao.com', id_endereco: endPedro._id, id_regiao: regioes.Guarapari._id })
  };

  const endMercado = await endereco({ cep: '29055-460', logradouro: 'Rua Joaquim Lírio', numero: '250', complemento: null, bairro: 'Praia do Canto', cidade: 'Vitória', estado: 'ES' });
  const endHotel = await endereco({ cep: '29101-385', logradouro: 'Av. Antônio Gil Veloso', numero: '900', complemento: null, bairro: 'Praia da Costa', cidade: 'Vila Velha', estado: 'ES' });
  const endClinica = await endereco({ cep: '29164-020', logradouro: 'Rua dos Ipês', numero: '40', complemento: 'Loja 1', bairro: 'Jardim Limoeiro', cidade: 'Serra', estado: 'ES' });
  const endEscola = await endereco({ cep: '29146-200', logradouro: 'Rua Santa Luzia', numero: '15', complemento: null, bairro: 'Campo Grande', cidade: 'Cariacica', estado: 'ES' });
  const endRestaurante = await endereco({ cep: '29216-090', logradouro: 'Av. Beira Mar', numero: '30', complemento: null, bairro: 'Praia do Morro', cidade: 'Guarapari', estado: 'ES' });
  const endFarmacia = await endereco({ cep: '29135-000', logradouro: 'Av. Florentino Avidos', numero: '210', complemento: null, bairro: 'Centro', cidade: 'Viana', estado: 'ES' });

  const clientes = {
    mercado: await Cliente.create({ nome: 'Supermercado Central', cnpj: empresas.mercado, telefone: '(27) 98888-1000', id_endereco: endMercado._id }),
    hotel: await Cliente.create({ nome: 'Hotel Mar Aberto', cnpj: empresas.hotel, telefone: '(27) 99210-4455', id_endereco: endHotel._id }),
    clinica: await Cliente.create({ nome: 'Clínica Serra Sul', cnpj: empresas.clinica, telefone: '(27) 99630-2211', id_endereco: endClinica._id }),
    escola: await Cliente.create({ nome: 'Escola Novo Horizonte', cnpj: empresas.escola, telefone: '(27) 98877-3344', id_endereco: endEscola._id }),
    restaurante: await Cliente.create({ nome: 'Restaurante Beira Mar', cnpj: empresas.restaurante, telefone: '(28) 99940-1188', id_endereco: endRestaurante._id }),
    farmacia: await Cliente.create({ nome: 'Farmácia Vida Plena', cnpj: empresas.farmacia, telefone: '(27) 99711-9090', id_endereco: endFarmacia._id })
  };

  const produtos = {
    split9: await Produto.create({ nome: 'Ar-condicionado Split 9000 BTUs', descricao: 'Frio, gás R32, 220V.', preco: 1890 }),
    split12: await Produto.create({ nome: 'Ar-condicionado Split 12000 BTUs Inverter', descricao: 'Gás R32 e serpentina de cobre.', preco: 2350 }),
    split18: await Produto.create({ nome: 'Ar-condicionado Split 18000 BTUs Inverter', descricao: 'Quente e frio, baixo ruído.', preco: 3290 }),
    cassete: await Produto.create({ nome: 'Ar-condicionado Cassete 36000 BTUs', descricao: 'Para salões comerciais, 220V.', preco: 7100 }),
    piso: await Produto.create({ nome: 'Ar-condicionado Piso Teto 48000 BTUs', descricao: 'Ambientes amplos, ciclo frio.', preco: 8900 }),
    cortina: await Produto.create({ nome: 'Cortina de ar 1,20 m', descricao: 'Para portas de loja.', preco: 980 }),
    instalacao: await Produto.create({ nome: 'Instalação de split', descricao: 'Mão de obra com tubulação de até 3 metros.', preco: 450 })
  };

  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 9, 3, 12)),
    perc_comissao: 5,
    id_cliente: clientes.hotel._id,
    id_vendedor: vendedores['Vila Velha']._id,
    itens: [{ id_produto: produtos.split12._id, quantidade: 2, preco_unitario: produtos.split12.preco }]
  });
  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 9, 18, 12)),
    perc_comissao: 4,
    id_cliente: clientes.mercado._id,
    id_vendedor: vendedores['Vitória']._id,
    itens: [{ id_produto: produtos.cassete._id, quantidade: 1, preco_unitario: produtos.cassete.preco }]
  });
  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 10, 2, 12)),
    perc_comissao: 6,
    id_cliente: clientes.clinica._id,
    id_vendedor: vendedores.Serra._id,
    itens: [
      { id_produto: produtos.split9._id, quantidade: 3, preco_unitario: produtos.split9.preco },
      { id_produto: produtos.instalacao._id, quantidade: 3, preco_unitario: produtos.instalacao.preco }
    ]
  });
  await Pedido.create({
    data_pedido: new Date(Date.UTC(2026, 10, 8, 12)),
    perc_comissao: 5,
    id_cliente: clientes.restaurante._id,
    id_vendedor: vendedores.Guarapari._id,
    itens: [{ id_produto: produtos.cortina._id, quantidade: 2, preco_unitario: produtos.cortina.preco }]
  });

  const contagem = {
    regioes: await Regiao.countDocuments(),
    vendedores: await Vendedor.countDocuments(),
    empresas: await Cliente.countDocuments(),
    produtos: await Produto.countDocuments(),
    pedidos: await Pedido.countDocuments()
  };
  const repetida = await Vendedor.aggregate([
    { $group: { _id: '$id_regiao', total: { $sum: 1 } } },
    { $match: { total: { $gt: 1 } } }
  ]);
  if (repetida.length) throw new Error('Há vendedor com mais de uma região, ou região repetida.');
  console.log(JSON.stringify(contagem));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_) { /* já saiu */ }
  process.exit(1);
});
