# Central de Ar — Gestão de Vendas

Sistema comercial para controlar o ciclo de venda de uma empresa de climatização: cadastro de clientes e vendedores, regiões de atendimento, catálogo de produtos, pedidos e comissões.

A aplicação impõe as regras de negócio na interface, na API e no banco. CNPJ e CPF são formatados e validados, cada documento é único, o telefone aceita apenas celular com DDD e cada região tem um único vendedor. O preço praticado fica gravado no pedido, então o histórico não muda se o catálogo for alterado depois.

Os relatórios mostram o total vendido por região, cliente, vendedor e produto, além do extrato de comissão de cada vendedor.

## Stack

- Node.js e Express
- MongoDB, com validação de esquema e índices únicos
- Interface web em um único HTML, servida pela própria API

## O que você precisa

- [Node.js](https://nodejs.org/) 18 ou mais recente
- Um MongoDB acessível. Pode ser o MongoDB local ou um cluster no [MongoDB Atlas](https://www.mongodb.com/atlas)

A senha do banco não fica no código. Ela entra só pelo arquivo `.env`, que o Git ignora.

## Como executar

1. Clone o repositório e entre na pasta.
2. Instale as dependências:

```bash
npm install
```

3. Crie o arquivo de ambiente a partir do exemplo:

```bash
copy .env.example .env
```

No macOS ou no Linux, use `cp .env.example .env`.

4. Abra o `.env` e troque `MONGO_URI` pela conexão do seu banco. Dois formatos comuns:

```text
MONGO_URI=mongodb://127.0.0.1:27017/central_de_ar
```

```text
MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/central_de_ar
```

Se a senha tiver caracteres como `@`, `#` ou `:`, codifique esses caracteres na URI.

5. Suba a API:

```bash
npm start
```

6. Abra [http://localhost:3000](http://localhost:3000).

O terminal deve mostrar a porta e a mensagem de conexão com o MongoDB. A página mostra **Conectado ao banco** quando a API responde em `/api/health`.

## Como testar o site

O banco começa vazio. Há duas formas de experimentar o sistema.

### Com dados de exemplo

Este comando apaga os cadastros atuais desse banco e grava regiões, vendedores, empresas, produtos e pedidos de demonstração:

```bash
npm run seed
```

Rode isso com o servidor parado, ou rode e depois atualize a página. Em seguida abra [http://localhost:3000](http://localhost:3000) e percorra:

1. **Painel** — totais por região, cliente, vendedor e produto, e o extrato de comissão.
2. **Pedidos** — filtre por período com os campos **De** e **Até**. Abra **Ver itens** em um pedido.
3. **Empresas** — o CNPJ ganha a máscara sozinho. Um CNPJ repetido é recusado.
4. **Vendedores** — o CPF e o celular são validados. A mesma região não aceita um segundo vendedor.
5. **Produtos** e **Novo pedido** — monte um pedido. O preço fica salvo naquele pedido.
6. **Regiões** e **Endereços** — cadastre, edite e exclua. A exclusão é bloqueada quando o registro ainda está em uso.

### Pelo cadastro manual

Sem o seed, use **Novo...** em cada seção, nesta ordem: endereço, região, vendedor, empresa, produto e pedido. O pedido só aparece depois que empresa, vendedor e produto existem.

### Conferir a API

Com o servidor no ar:

```bash
curl http://localhost:3000/api/health
```

A resposta esperada é `{"ok":true}`.

## O que não vai para o GitHub

- `node_modules` — quem clonar o projeto roda `npm install`
- `.env` — usuário, senha e endereço do banco
- scripts antigos de outro banco, com credencial fixa no código

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm start` | Sobe a API na porta do `.env` (padrão 3000) e abre o painel |
| `npm run seed` | Substitui os dados do banco por um conjunto de demonstração |
| `node scripts/align-database.js` | Ajusta validadores e remove coleções com nome antigo. Use só em um banco seu |
