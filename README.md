# Central de Ar — Gestão de Vendas

Painel comercial de uma empresa de climatização. Acompanha a venda do começo ao fim: quem atende cada região, quais empresas são clientes, o que está no catálogo e o que já foi pedido.

O site publicado está em [https://central-de-ar.vercel.app](https://central-de-ar.vercel.app). A senha do painel não está neste repositório.

## O que o sistema faz

- Cadastro de endereços, regiões, vendedores, empresas e produtos.
- Pedido com itens, data e percentual de comissão. O preço gravado é o do catálogo naquele momento. Uma alteração posterior no produto não reescreve o histórico.
- Cada região tem um vendedor só. CNPJ e CPF são validados e não podem repetir. O telefone precisa ser celular, com DDD.
- Ao apagar uma empresa ou um vendedor, o endereço sai junto se mais ninguém o estiver usando. Um cadastro que ainda tem pedido não é apagado.
- Painel com total vendido por região, cliente, vendedor e produto, e com a comissão a receber.
- Consulta de CNPJ em fonte pública para preencher a empresa. O CEP completo busca o logradouro.
- A lista se atualiza sozinha quando outra pessoa grava um cadastro. Um formulário aberto não é interrompido.
- No celular, as seções rolam na horizontal, os formulários abrem de baixo para cima e as listas viram cartões.

## Como o código está organizado

Node.js e Express servem a página e a API. O MongoDB guarda os cadastros pelo Mongoose. Não há framework de frontend: a interface está em `frontend.html`.

| Arquivo | Papel |
| --- | --- |
| `server.js` | Rotas, regras de negócio e respostas da API |
| `models.js` | Coleções, índices únicos e validação no banco |
| `lib/acesso.js` | Senha, sessão, limite de tentativas e cabeçalhos |
| `lib/documento.js` | CPF, CNPJ e celular |
| `frontend.html` | Painel, login e atualização da lista |
| `config.js` | Leitura das variáveis de ambiente |
| `vercel.json` | Cabeçalhos HTTP da publicação |

## O que um leitor encontra na segurança

A senha só é conferida no servidor, com scrypt e comparação de tempo constante. A sessão vai em cookie `HttpOnly`, `Secure` e `SameSite=Strict`. Listar, filtrar, criar, editar e apagar exigem essa sessão. O preço do pedido não é aceito do navegador: vem do catálogo.

Datas entram no filtro só no formato `AAAA-MM-DD`. Identificadores passam por validação antes de irem ao banco. Textos gravados são escapados antes de irem para o HTML. O login aceita 8 tentativas a cada 15 minutos por IP.

`MONGO_URI`, `APP_PASSWORD` e `SESSION_SECRET` ficam no ambiente da Vercel. O `.env` está no `.gitignore`. Mensagens de erro no log não imprimem a URI do banco.
