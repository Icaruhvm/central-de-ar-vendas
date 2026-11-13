# Central de Ar — Gestão de Vendas

Sistema comercial para controlar o ciclo de venda de uma empresa de climatização: cadastro de clientes e vendedores, regiões de atendimento, catálogo de produtos, pedidos e comissões.

A aplicação impõe as regras de negócio na interface, na API e no banco. CNPJ e CPF são formatados e validados, cada documento é único, o telefone aceita apenas celular com DDD e cada região tem um único vendedor. O preço praticado fica gravado no pedido, então o histórico não muda se o catálogo for alterado depois.

Os relatórios mostram o total vendido por região, cliente, vendedor e produto, além do extrato de comissão de cada vendedor.

## Stack

- Node.js e Express
- MongoDB, com validação de esquema e índices únicos
- Interface web responsiva

## Como executar

1. Entre na pasta do backend.
2. Rode `npm install` e depois `npm start`.
3. Abra `http://localhost:3000`.
