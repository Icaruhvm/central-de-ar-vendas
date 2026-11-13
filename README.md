# Central de Ar — Gestão de Vendas

Painel para uma empresa de climatização acompanhar a venda do começo ao fim: quem atende cada região, quais empresas são clientes, o que está no catálogo e o que já foi pedido.

CNPJ e CPF são validados e não podem repetir. O telefone precisa ser celular, com DDD. Cada região fica com um vendedor só. Quando um pedido é fechado, o preço daquele momento fica gravado nele. Se o catálogo mudar depois, o histórico continua o mesmo.

No painel dá para ver o total vendido por região, cliente, vendedor e produto, e também quanto de comissão cada vendedor tem a receber.

Feito com Node.js, Express e MongoDB. A tela abre no navegador, servida pela própria API.

## Para rodar

Você vai precisar do [Node.js](https://nodejs.org/) 18 ou mais novo, e de um MongoDB. Pode ser o que está instalado na sua máquina ou um cluster grátis no [MongoDB Atlas](https://www.mongodb.com/atlas).

```bash
npm install
copy .env.example .env
```

No Mac ou no Linux, o segundo comando é `cp .env.example .env`.

Abra o `.env` e coloque a conexão do seu banco no lugar do exemplo:

```text
MONGO_URI=mongodb://127.0.0.1:27017/central_de_ar
```

Se for Atlas, fica mais ou menos assim:

```text
MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/central_de_ar
```

Se a senha tiver `@`, `#` ou `:`, esses caracteres precisam ir codificados na URI, senão a conexão quebra no meio.

O `.env` fica só na sua máquina. Ele já está no `.gitignore`, então a senha não sobe junto com o código. A pasta `node_modules` também não: o `npm install` recria ela.

Depois é só:

```bash
npm start
```

Abra [http://localhost:3000](http://localhost:3000). Se deu certo, o terminal avisa a porta e a página mostra **Conectado ao banco**.

## Para testar

O banco começa vazio. O caminho mais rápido é carregar um conjunto de exemplo: regiões do Espírito Santo, vendedores, empresas, produtos e alguns pedidos.

```bash
npm run seed
```

Esse comando apaga o que já estiver nesse banco e grava os dados de demonstração. Pode rodar com o servidor parado. Se ele já estiver no ar, atualize a página depois.

Aí vale olhar nesta ordem:

1. **Painel**, para ver os totais e a comissão.
2. **Pedidos**, usando **De** e **Até** para filtrar o período, e **Ver itens** para abrir um pedido.
3. **Empresas**. O CNPJ se formata sozinho, e um CNPJ que já existe é recusado.
4. **Vendedores**. CPF e celular passam pela validação, e a mesma região não aceita dois responsáveis.
5. **Produtos** e um **Novo pedido**. O preço que entrar ali fica preso naquele pedido.
6. **Regiões** e **Endereços**. Dá para criar, editar e excluir. Se o registro ainda estiver em uso, a exclusão é barrada.

Se preferir montar tudo na mão, comece por endereço, depois região, vendedor, empresa e produto. O pedido só faz sentido quando esses cadastros já existem.

Para checar se a API está de pé:

```bash
curl http://localhost:3000/api/health
```

A resposta é `{"ok":true}`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe o servidor na porta do `.env` (3000, se você não mudar) |
| `npm run seed` | Troca os dados do banco pelo conjunto de demonstração |
| `node scripts/align-database.js` | Acerta validadores e apaga coleções com nome antigo. Só use num banco que seja seu |
