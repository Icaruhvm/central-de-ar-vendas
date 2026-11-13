const mongoose = require('mongoose');
const doc = require('./lib/documento');

function jsonOpts(idField) {
  return {
    versionKey: false,
    transform(_documento, ret) {
      const bruto = ret._id != null ? ret._id : ret.id;
      if (bruto != null && bruto !== 'undefined') {
        const id = typeof bruto.toHexString === 'function' ? bruto.toHexString() : String(bruto);
        ret[idField] = id;
        ret.id = id;
      }
      delete ret._id;
      for (const chave of Object.keys(ret)) {
        const valor = ret[chave];
        if (valor && typeof valor.toHexString === 'function') ret[chave] = valor.toHexString();
      }
      return ret;
    }
  };
}

const EnderecoSchema = new mongoose.Schema({
  cep: {
    type: String,
    required: [true, 'Informe o CEP.'],
    validate: { validator: doc.cepValido, message: 'CEP inválido. Use 8 dígitos, no formato 00000-000.' }
  },
  logradouro: {
    type: String,
    required: [true, 'Informe a rua.'],
    minlength: [2, 'A rua precisa ter pelo menos 2 caracteres.'],
    maxlength: [120, 'A rua pode ter no máximo 120 caracteres.']
  },
  numero: {
    type: String,
    required: [true, 'Informe o número. Use S/N se não houver.'],
    maxlength: [10, 'O número pode ter no máximo 10 caracteres.'],
    validate: {
      validator: (valor) => /^[\p{L}0-9./-]{1,10}$/u.test(String(valor).trim()),
      message: 'Número inválido. Use até 10 caracteres, como 100 ou S/N.'
    }
  },
  complemento: {
    type: String,
    default: null,
    maxlength: [50, 'O complemento pode ter no máximo 50 caracteres.']
  },
  bairro: {
    type: String,
    required: [true, 'Informe o bairro.'],
    minlength: [2, 'O bairro precisa ter pelo menos 2 caracteres.'],
    maxlength: [60, 'O bairro pode ter no máximo 60 caracteres.']
  },
  cidade: {
    type: String,
    required: [true, 'Informe a cidade.'],
    minlength: [2, 'A cidade precisa ter pelo menos 2 caracteres.'],
    maxlength: [60, 'A cidade pode ter no máximo 60 caracteres.']
  },
  estado: {
    type: String,
    required: [true, 'Informe a UF.'],
    enum: { values: doc.UFS, message: 'Estado deve ser a sigla, por exemplo ES.' }
  }
}, { versionKey: false, toJSON: jsonOpts('id_endereco'), toObject: jsonOpts('id_endereco') });

EnderecoSchema.pre('validate', function () {
  if (this.cep != null) this.cep = doc.formatCEP(this.cep);
  if (this.logradouro != null) this.logradouro = doc.cleanName(this.logradouro);
  if (this.numero != null) this.numero = String(this.numero).trim();
  if (this.complemento != null) {
    const complemento = String(this.complemento).trim();
    this.complemento = complemento || null;
  }
  if (this.bairro != null) this.bairro = doc.cleanName(this.bairro);
  if (this.cidade != null) this.cidade = doc.cleanName(this.cidade);
  if (this.estado != null) this.estado = String(this.estado).trim().toUpperCase();
});

const RegiaoSchema = new mongoose.Schema({
  nome_regiao: {
    type: String,
    required: [true, 'Informe o nome da região.'],
    validate: {
      validator: doc.regiaoValida,
      message: 'Nome de região inválido. Use de 2 a 50 letras, sem números.'
    }
  }
}, { versionKey: false, toJSON: jsonOpts('id_regiao'), toObject: jsonOpts('id_regiao') });

RegiaoSchema.pre('validate', function () {
  if (this.nome_regiao != null) this.nome_regiao = doc.cleanName(this.nome_regiao);
});
RegiaoSchema.index({ nome_regiao: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });

const VendedorSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Informe o nome do vendedor.'],
    validate: { validator: doc.nomeValido, message: 'Nome inválido. Use de 2 a 100 caracteres.' }
  },
  cpf: {
    type: String,
    required: [true, 'Informe o CPF.'],
    unique: true,
    validate: {
      validator: doc.cpfValido,
      message: 'CPF inválido. Ele precisa ter 14 caracteres no formato 000.000.000-00.'
    }
  },
  telefone: {
    type: String,
    required: [true, 'Informe o celular do vendedor.'],
    validate: {
      validator: doc.telefoneValido,
      message: 'Celular inválido. Use 15 caracteres no formato (27) 99999-0000.'
    }
  },
  email: {
    type: String,
    required: [true, 'Informe o e-mail.'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [100, 'O e-mail pode ter no máximo 100 caracteres.'],
    validate: { validator: doc.emailValido, message: 'E-mail inválido.' }
  },
  id_endereco: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Endereco',
    required: [true, 'O vendedor precisa de um endereço.']
  },
  id_regiao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Regiao',
    required: [true, 'Escolha a região do vendedor.'],
    unique: true
  }
}, { versionKey: false, toJSON: jsonOpts('id_vendedor'), toObject: jsonOpts('id_vendedor') });

VendedorSchema.pre('validate', function () {
  if (this.nome != null) this.nome = doc.cleanName(this.nome);
  if (this.cpf != null) this.cpf = doc.formatCPF(this.cpf);
  if (this.telefone != null) this.telefone = doc.formatPhone(this.telefone);
  if (this.email != null) this.email = String(this.email).trim().toLowerCase();
});

const ClienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Informe a razão social.'],
    validate: { validator: doc.nomeValido, message: 'Razão social inválida. Use de 2 a 100 caracteres.' }
  },
  cnpj: {
    type: String,
    required: [true, 'Informe o CNPJ.'],
    unique: true,
    validate: {
      validator: doc.cnpjValido,
      message: 'CNPJ inválido. Use 18 caracteres no formato 00.000.000/0000-00, com os dígitos verificadores corretos.'
    }
  },
  telefone: {
    type: String,
    required: [true, 'Informe o celular da empresa.'],
    validate: {
      validator: doc.telefoneValido,
      message: 'Celular inválido. Use 15 caracteres no formato (27) 99999-0000.'
    }
  },
  id_endereco: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Endereco',
    required: [true, 'A empresa precisa de um endereço.']
  }
}, { versionKey: false, toJSON: jsonOpts('id_cliente'), toObject: jsonOpts('id_cliente') });

ClienteSchema.pre('validate', function () {
  if (this.nome != null) this.nome = doc.cleanName(this.nome);
  if (this.cnpj != null) this.cnpj = doc.formatCNPJ(this.cnpj);
  if (this.telefone != null) this.telefone = doc.formatPhone(this.telefone);
});

const ProdutoSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Informe o nome do produto.'],
    validate: { validator: doc.nomeValido, message: 'Nome do produto inválido. Use de 2 a 100 caracteres.' }
  },
  descricao: {
    type: String,
    default: '',
    maxlength: [255, 'A descrição pode ter no máximo 255 caracteres.']
  },
  preco: {
    type: Number,
    required: [true, 'Informe o preço.'],
    min: [0.01, 'O preço precisa ser maior que zero.'],
    max: [9999999.99, 'O preço máximo é R$ 9.999.999,99.']
  }
}, { versionKey: false, toJSON: jsonOpts('id_produto'), toObject: jsonOpts('id_produto') });

ProdutoSchema.pre('validate', function () {
  if (this.nome != null) this.nome = doc.cleanName(this.nome);
  if (this.descricao != null) this.descricao = String(this.descricao).trim();
  if (this.preco != null) {
    const preco = doc.money(this.preco);
    if (preco != null) this.preco = preco;
  }
});
ProdutoSchema.path('preco').validate(function (valor) {
  return doc.money(valor) != null;
}, 'O preço deve ter no máximo 2 casas decimais.');

const ItemPedidoSchema = new mongoose.Schema({
  id_produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  quantidade: { type: Number, required: true, min: 1, max: 9999 },
  preco_unitario: { type: Number, required: true, min: 0.01, max: 9999999.99 }
}, { _id: false });

const PedidoSchema = new mongoose.Schema({
  data_pedido: { type: Date, required: [true, 'Informe a data do pedido.'] },
  perc_comissao: {
    type: Number,
    required: [true, 'Informe a comissão do pedido.'],
    min: [0, 'A comissão não pode ser negativa.'],
    max: [100, 'A comissão máxima é 100%.']
  },
  id_cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: [true, 'Escolha a empresa.'] },
  id_vendedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendedor', required: [true, 'Escolha o vendedor.'] },
  itens: {
    type: [ItemPedidoSchema],
    validate: {
      validator: (itens) => Array.isArray(itens) && itens.length > 0 && itens.length <= 30,
      message: 'O pedido precisa ter de 1 a 30 produtos.'
    }
  }
}, { versionKey: false, toJSON: jsonOpts('id_pedido'), toObject: jsonOpts('id_pedido') });

PedidoSchema.index({ id_cliente: 1 });
PedidoSchema.index({ id_vendedor: 1 });
PedidoSchema.index({ data_pedido: -1 });

const texto = (min, max) => ({ bsonType: 'string', minLength: min, maxLength: max });

const collectionValidators = {
  endereco: {
    bsonType: 'object',
    required: ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'],
    properties: {
      cep: { bsonType: 'string', pattern: doc.CEP_PATTERN },
      logradouro: texto(2, 120),
      numero: texto(1, 10),
      complemento: { bsonType: ['string', 'null'], maxLength: 50 },
      bairro: texto(2, 60),
      cidade: texto(2, 60),
      estado: { bsonType: 'string', enum: doc.UFS }
    }
  },
  regiao: {
    bsonType: 'object',
    required: ['nome_regiao'],
    properties: { nome_regiao: texto(2, 50) }
  },
  vendedor: {
    bsonType: 'object',
    required: ['nome', 'cpf', 'telefone', 'email', 'id_endereco', 'id_regiao'],
    properties: {
      nome: texto(2, 100),
      cpf: { bsonType: 'string', pattern: doc.CPF_PATTERN, minLength: 14, maxLength: 14 },
      telefone: { bsonType: 'string', pattern: doc.PHONE_PATTERN, minLength: 15, maxLength: 15 },
      email: { bsonType: 'string', minLength: 6, maxLength: 100 },
      id_endereco: { bsonType: 'objectId' },
      id_regiao: { bsonType: 'objectId' }
    }
  },
  cliente: {
    bsonType: 'object',
    required: ['nome', 'cnpj', 'telefone', 'id_endereco'],
    properties: {
      nome: texto(2, 100),
      cnpj: { bsonType: 'string', pattern: doc.CNPJ_PATTERN, minLength: 18, maxLength: 18 },
      telefone: { bsonType: 'string', pattern: doc.PHONE_PATTERN, minLength: 15, maxLength: 15 },
      id_endereco: { bsonType: 'objectId' }
    }
  },
  produto: {
    bsonType: 'object',
    required: ['nome', 'preco'],
    properties: {
      nome: texto(2, 100),
      descricao: { bsonType: 'string', maxLength: 255 },
      preco: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0.01, maximum: 9999999.99 }
    }
  },
  pedido: {
    bsonType: 'object',
    required: ['data_pedido', 'perc_comissao', 'id_cliente', 'id_vendedor', 'itens'],
    properties: {
      data_pedido: { bsonType: 'date' },
      perc_comissao: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, maximum: 100 },
      id_cliente: { bsonType: 'objectId' },
      id_vendedor: { bsonType: 'objectId' },
      itens: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 30,
        items: {
          bsonType: 'object',
          required: ['id_produto', 'quantidade', 'preco_unitario'],
          properties: {
            id_produto: { bsonType: 'objectId' },
            quantidade: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 9999 },
            preco_unitario: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0.01, maximum: 9999999.99 }
          }
        }
      }
    }
  }
};

async function aplicarValidadores(db) {
  for (const [nome, schema] of Object.entries(collectionValidators)) {
    const existe = (await db.listCollections({ name: nome }).toArray()).length > 0;
    if (!existe) {
      await db.createCollection(nome, {
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error'
      });
    } else {
      await db.command({
        collMod: nome,
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error'
      });
    }
  }
}

const Endereco = mongoose.model('Endereco', EnderecoSchema, 'endereco');
const Regiao = mongoose.model('Regiao', RegiaoSchema, 'regiao');
const Vendedor = mongoose.model('Vendedor', VendedorSchema, 'vendedor');
const Cliente = mongoose.model('Cliente', ClienteSchema, 'cliente');
const Produto = mongoose.model('Produto', ProdutoSchema, 'produto');
const Pedido = mongoose.model('Pedido', PedidoSchema, 'pedido');

module.exports = {
  Endereco,
  Regiao,
  Vendedor,
  Cliente,
  Produto,
  Pedido,
  collectionValidators,
  aplicarValidadores
};
