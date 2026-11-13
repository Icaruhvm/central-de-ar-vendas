const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const DDDS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99'
]);

const CNPJ_PATTERN = '^\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}$';
const CPF_PATTERN = '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$';
const CEP_PATTERN = '^\\d{5}-\\d{3}$';
const PHONE_PATTERN = '^\\((' + [...DDDS].join('|') + ')\\) 9\\d{4}-\\d{4}$';

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function formatCNPJ(value) {
  const d = onlyDigits(value);
  if (d.length !== 14) return String(value ?? '').trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCPF(value) {
  const d = onlyDigits(value);
  if (d.length !== 11) return String(value ?? '').trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(value) {
  const d = onlyDigits(value);
  if (d.length !== 11) return String(value ?? '').trim();
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCEP(value) {
  const d = onlyDigits(value);
  if (d.length !== 8) return String(value ?? '').trim();
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function digito(base, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpjValido(value) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const d1 = digito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

function cpfValido(value) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const d1 = digito(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

function telefoneValido(value) {
  return new RegExp(PHONE_PATTERN).test(String(value ?? '').trim());
}

function cepValido(value) {
  const masked = String(value ?? '').trim();
  if (!new RegExp(CEP_PATTERN).test(masked)) return false;
  return masked !== '00000-000';
}

function emailValido(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function nomeValido(value) {
  const nome = cleanName(value);
  return nome.length >= 2 && nome.length <= 100 && /\p{L}/u.test(nome);
}

function regiaoValida(value) {
  const nome = cleanName(value);
  return nome.length >= 2 && nome.length <= 50 && /^[\p{L}][\p{L}\s'-]*$/u.test(nome);
}

function money(value) {
  if (typeof value === 'string') {
    const texto = value.trim();
    value = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return null;
  return Math.round(n * 100) / 100;
}

module.exports = {
  UFS,
  DDDS,
  CNPJ_PATTERN,
  CPF_PATTERN,
  CEP_PATTERN,
  PHONE_PATTERN,
  onlyDigits,
  cleanName,
  formatCNPJ,
  formatCPF,
  formatPhone,
  formatCEP,
  cnpjValido,
  cpfValido,
  telefoneValido,
  cepValido,
  emailValido,
  nomeValido,
  regiaoValida,
  money
};

if (require.main === module) {
  const falhas = [];
  const ok = (cond, msg) => { if (!cond) falhas.push(msg); };
  ok(formatCNPJ('12345678000195') === '12.345.678/0001-95', 'mascara cnpj');
  ok(formatCNPJ('12.345.678/0001-95').length === 18, 'cnpj 18');
  ok(cnpjValido('12.345.678/0001-95'), 'cnpj valido');
  ok(!cnpjValido('12.345.678/0001-99'), 'cnpj digito');
  ok(!cnpjValido('111111111111111111'), 'cnpj repetido');
  ok(formatCPF('39053344705') === '390.533.447-05', 'mascara cpf');
  ok(formatCPF('39053344705').length === 14, 'cpf 14');
  ok(cpfValido('390.533.447-05'), 'cpf valido');
  ok(!cpfValido('111.111.111-11'), 'cpf repetido');
  ok(formatPhone('27999911111') === '(27) 99991-1111', 'mascara celular');
  ok(formatPhone('27999911111').length === 15, 'celular 15');
  ok(telefoneValido('(27) 99991-1111'), 'celular valido');
  ok(!telefoneValido('(27) 3333-1111'), 'fixo recusado');
  ok(!telefoneValido('(27) 99991-11110'), 'celular longo');
  ok(cepValido('29101-350'), 'cep');
  ok(!cepValido('31231'), 'cep curto');
  if (falhas.length) {
    console.error(falhas.join('\n'));
    process.exit(1);
  }
  console.log('Regras de documento ok.');
}
