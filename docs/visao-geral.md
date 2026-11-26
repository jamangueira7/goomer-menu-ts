# Goomer Menu API: cronogramas em TypeScript, PHP e Java

Nov 25, 2026 · @João Mangueira

## Visão geral

O mesmo desafio da Goomer (API de produtos, promoções e cardápio de restaurante) vira três projetos com o mesmo contrato de API, o mesmo banco e as mesmas regras, mudando só a linguagem. São 15 semanas no total, a cerca de 8 h por semana, uma trilha depois da outra.

| Trilha | Stack principal | Duração | Por que nessa ordem |
| --- | --- | --- | --- |
| 1 — TypeScript | Node 22 + Fastify + `pg` | 5 semanas | É a stack exigida pelo desafio; essa versão é a que pode ser entregue |
| 2 — PHP | PHP 8.4 + Slim 4 + PDO | 4 semanas | É sua stack de dia a dia; com o desenho já resolvido no TS, a trilha anda mais rápido |
| 3 — Java | Java 21 + Spring Boot + `JdbcClient` | 6 semanas | Stack mais nova para você; ganha uma semana a mais para Spring Security e testes |

O que vale para as três trilhas (o padrão de sempre):

- Arquitetura limpa: domínio puro, casos de uso, infraestrutura e HTTP em camadas separadas, com a regra de dependência apontando para dentro.
- API RESTful versionada em `/api/v1`, com documentação OpenAPI.
- Só o cardápio é público para consulta; além dele, apenas as rotas de autenticação (login e recuperação de senha) dispensam token, porque servem justamente a quem ainda não tem um. Todo o resto, inclusive o cadastro de usuários, passa por um middleware de autenticação JWT.
- Testes unitários no domínio e nos casos de uso, integração nos repositórios com Postgres real e ponta a ponta nas rotas.
- Tudo sobe com `docker compose up`, com Postgres, migrations e um usuário admin de exemplo.
- SQL puro nas consultas e ORM só para as migrations, como o desafio pede.
- README com instruções para rodar e com os desafios encontrados, commits pequenos no padrão Conventional Commits e uma branch por funcionalidade.

Um ponto de atenção: o desafio pede Node.js com TypeScript e proíbe frameworks que impõem arquitetura. As versões em PHP e Java são para estudo. No PHP, por isso, a escolha foi o Slim (equivalente ao Fastify) e não o Laravel. No Java, o Spring Boot foi pedido por você e fica, mas com o domínio sem nenhuma anotação do Spring.

As regras e o contrato comuns estão nesta aba; cada trilha tem uma aba própria com stack, estrutura de pastas e tarefas semana a semana.

## Regras de negócio e decisões de interpretação

O que o desafio exige:

- Produto: nome, preço, categoria (Entradas, Pratos principais, Sobremesas ou Bebidas) e flag de visibilidade.
- Promoção: descrição, preço promocional, dias da semana e horários em que vale.
- Horários no formato `HH:mm`, com intervalo mínimo de 15 minutos.
- Cardápio consolidado: nunca mostra produto invisível e só aplica promoção dentro do dia e horário definidos.
- Opcionais: ordenação dos produtos no cardápio e fuso horário por restaurante. Se entrarem, têm que funcionar 100%.

Pontos que o enunciado deixa em aberto e a decisão tomada (vai para o README como "desafios encontrados"):

| Ponto em aberto | Decisão |
| --- | --- |
| O que é "intervalo mínimo de 15 minutos" | Os minutos só aceitam 00, 15, 30 ou 45, e o fim tem que ficar pelo menos 15 minutos depois do início |
| Promoção que vira a meia-noite (ex.: 22:00 às 02:00) | Rejeitada no MVP; quem precisar cadastra duas janelas, uma em cada dia |
| Duas promoções do mesmo produto no mesmo horário | Proibido; a API responde 409 se as janelas se sobrepõem |
| Preço promocional maior ou igual ao preço normal | Proibido; a API responde 422 |
| O enunciado cita "horários de disponibilidade dos produtos" mas não lista esse campo | Produto ganha janelas de disponibilidade opcionais; sem janela, está sempre disponível |
| Tipo do preço | Inteiro em centavos no banco e um objeto de valor `Money` no domínio, nunca ponto flutuante |
| Excluir produto que tem promoção | As promoções dele são excluídas junto (`ON DELETE CASCADE`) |
| Hora "agora" para calcular o cardápio | Vem de um relógio injetável (`Clock`), convertido para o fuso do restaurante; nos testes, o relógio é fixo |

## Contrato da API REST

As três trilhas expõem exatamente as mesmas rotas, então a mesma coleção de testes de ponta a ponta (e a mesma coleção do Insomnia ou Bruno) serve para todas.

| Método e rota | Acesso | O que faz |
| --- | --- | --- |
| `GET /api/v1/restaurants/{id}/menu` | **Pública** | Cardápio consolidado: só produtos visíveis e disponíveis agora, agrupados por categoria e na ordem definida, com a promoção ativa quando houver |
| `POST /api/v1/auth/login` | Sem token (exceção técnica) | Recebe e-mail e senha e devolve o JWT; sem ela não há como obter token |
| `GET /api/v1/products` | JWT | Lista os produtos do restaurante, com filtros `?category=` e `?visible=` e paginação |
| `POST /api/v1/products` | JWT | Cria produto (201 com header `Location`) |
| `GET /api/v1/products/{id}` | JWT | Detalha um produto |
| `PUT /api/v1/products/{id}` | JWT | Atualiza o produto inteiro |
| `PATCH /api/v1/products/{id}/visibility` | JWT | Mostra ou esconde o produto sem excluí-lo |
| `PUT /api/v1/products/order` | JWT | Opcional: recebe a lista de ids na nova ordem do cardápio |
| `DELETE /api/v1/products/{id}` | JWT | Exclui o produto e as promoções dele (204) |
| `GET /api/v1/promotions` | JWT | Lista promoções, com filtro `?productId=` |
| `POST /api/v1/promotions` | JWT | Cria promoção para um produto com suas janelas de dia e horário |
| `GET /api/v1/promotions/{id}` | JWT | Detalha uma promoção |
| `PUT /api/v1/promotions/{id}` | JWT | Atualiza descrição, preço e janelas |
| `DELETE /api/v1/promotions/{id}` | JWT | Exclui a promoção (204) |

Como a autenticação funciona nas três trilhas:

- Um único middleware de autenticação é aplicado ao grupo de rotas protegidas; as rotas sem token (cardápio, login e recuperação de senha) ficam fora do grupo de propósito, e não por uma lista de exceções espalhada.
- O token é um JWT HS256 com validade de 1 hora, levando o id do usuário e o id do restaurante. O segredo vem de variável de ambiente.
- O restaurante das rotas protegidas vem sempre do token, nunca da URL, então um usuário não enxerga produtos de outro restaurante.
- Senha guardada com Argon2id ou bcrypt; o seed cria um admin de exemplo documentado no README.
- Sem token ou com token inválido ou vencido: 401. Recurso de outro restaurante: 404, para não revelar que ele existe.

### Usuários e recuperação de senha

| Método e rota | Acesso | O que faz |
| --- | --- | --- |
| `POST /api/v1/users` | JWT | Cadastra usuário (nome, e-mail e senha) no restaurante do token; 409 se o e-mail já existe |
| `GET /api/v1/users` | JWT | Lista os usuários do restaurante, sem nunca devolver o hash da senha |
| `DELETE /api/v1/users/{id}` | JWT | Remove um usuário do restaurante; 422 se a pessoa tentar remover a si mesma |
| `GET /api/v1/users/{id}/audit-logs` | JWT | Log de auditoria das ações do usuário `{id}` por período (`dateIni` obrigatório, `dateEnd` opcional); ver "Log de auditoria" |
| `POST /api/v1/auth/forgot-password` | Sem token | Recebe o e-mail e envia o link de redefinição; responde sempre 202 |
| `POST /api/v1/auth/reset-password` | Sem token | Recebe o token do e-mail e a nova senha; 204 se deu certo, 422 se o token é inválido, já foi usado ou venceu |

Regras do cadastro e da recuperação:

- O cadastro é protegido: só quem já é usuário cria outro. O primeiro admin nasce pelo seed ou pelo comando `make create-admin`.
- A senha é um objeto de valor `Password` no domínio, com no mínimo 8 caracteres, e só é guardada como hash.
- `forgot-password` responde 202 com a mesma mensagem exista ou não o e-mail, para não revelar quem está cadastrado.
- O token de redefinição tem 32 bytes aleatórios e vai só no link do e-mail. O banco guarda apenas o hash SHA-256 dele, com validade de 30 minutos e uso único; um novo pedido invalida o anterior.
- No máximo 5 pedidos de recuperação por e-mail e por IP a cada 15 minutos; acima disso, 429.
- O link usa a variável `APP_RESET_URL` com `?token=` no fim. Como o projeto não tem front, o README mostra como pegar o token no Mailpit e chamar `reset-password`.
- O envio fica atrás da porta `Mailer` na camada de aplicação. Se o SMTP falhar, o erro é registrado no log e a resposta continua 202.
- Depois da troca de senha, tokens JWT antigos continuam válidos até vencer, no máximo 1 hora; essa decisão vai para o README.

Padrão de respostas: erros no formato Problem Details (`application/problem+json`), 422 para dados inválidos, 404 para não encontrado, 409 para conflito de horário e preços sempre em centavos.

Exemplo do cardápio numa quarta às 18:30, com o happy hour ativo:

```json
{
  "restaurant": { "id": 1, "name": "Bar do João", "timezone": "America/Sao_Paulo" },
  "generatedAt": "2026-12-02T18:30:00-03:00",
  "categories": [
    {
      "name": "Bebidas",
      "products": [
        {
          "id": 7,
          "name": "Chopp 300 ml",
          "price": 1400,
          "promotion": { "description": "Happy hour: chopp pela metade do preço", "price": 700, "endsAt": "20:00" }
        }
      ]
    }
  ]
}
```

## Modelo de dados (PostgreSQL 16)

O mesmo esquema nas três trilhas. As regras que dá para garantir no banco ficam no banco também, como segunda linha de defesa depois do domínio.

| Tabela | Colunas principais | Restrições que valem pontos em "uso adequado do SQL" |
| --- | --- | --- |
| `restaurants` | `id`, `name`, `timezone` | `timezone` validado contra a lista IANA na aplicação |
| `users` | `id`, `restaurant_id`, `email`, `password_hash` | `email` único; chave estrangeira para o restaurante |
| `products` | `id`, `restaurant_id`, `name`, `price_cents`, `category`, `visible`, `position`, `created_at`, `updated_at` | `price_cents > 0`; `category` como tipo `ENUM` do Postgres; índice em `(restaurant_id, visible, category, position)` |
| `product_availability` | `product_id`, `weekday`, `start_time`, `end_time` | `weekday` de 0 a 6; minutos múltiplos de 15; `end_time >= start_time + 15 min` |
| `promotions` | `id`, `product_id`, `description`, `promo_price_cents` | `ON DELETE CASCADE` a partir do produto |
| `promotion_windows` | `promotion_id`, `product_id`, `weekday`, `start_time`, `end_time` | Mesmas regras de horário, mais `EXCLUDE USING gist` impedindo janelas sobrepostas do mesmo produto no mesmo dia |

Para usuários e recuperação de senha, `users` ganha a coluna `name` e entra a tabela `password_reset_tokens` (`id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`), com índice único em `token_hash` e `ON DELETE CASCADE` a partir do usuário.

Para o log de auditoria entra a tabela `audit_logs` (`id`, `restaurant_id`, `actor_user_id`, `actor_email`, `action`, `entity_type`, `entity_id`, `changes` em `jsonb`, `ip` em `inet`, `created_at`), com índice em `(restaurant_id, actor_user_id, created_at DESC)`. `actor_user_id` fica sem chave estrangeira de propósito, para o log sobreviver à exclusão do usuário.

A restrição de sobreposição usa a extensão `btree_gist` e um intervalo de minutos calculado a partir de `start_time` e `end_time`. Por isso `promotion_windows` repete o `product_id`: é o que permite ao Postgres comparar janelas de promoções diferentes do mesmo produto. A aplicação também checa antes, para devolver um 409 com mensagem clara em vez de um erro de banco.

O cardápio sai de uma única consulta: produtos visíveis do restaurante, filtrados pela disponibilidade (sem janela ou com janela que cobre o dia e hora locais), com `LEFT JOIN LATERAL` buscando a promoção ativa e ordenação por categoria, `position` e nome. O dia da semana e a hora locais entram como parâmetros, calculados pelo domínio a partir do `Clock` e do fuso do restaurante. Esboço da consulta:

```sql
SELECT p.id, p.name, p.category, p.price_cents,
       pr.description AS promo_description, pr.promo_price_cents, w.end_time AS promo_ends_at
FROM products p
LEFT JOIN LATERAL (
  SELECT pw.promotion_id, pw.end_time
  FROM promotion_windows pw
  WHERE pw.product_id = p.id AND pw.weekday = $2
    AND $3::time >= pw.start_time AND $3::time < pw.end_time
  LIMIT 1
) w ON TRUE
LEFT JOIN promotions pr ON pr.id = w.promotion_id
WHERE p.restaurant_id = $1
  AND p.visible
  AND (NOT EXISTS (SELECT 1 FROM product_availability a WHERE a.product_id = p.id)
       OR EXISTS (SELECT 1 FROM product_availability a
                  WHERE a.product_id = p.id AND a.weekday = $2
                    AND $3::time >= a.start_time AND $3::time < a.end_time))
ORDER BY p.category, p.position, p.name;
```

SQL puro nas consultas e ORM só nas migrations, em cada trilha:

| Trilha | Consultas | Migrations |
| --- | --- | --- |
| TypeScript | Driver `pg` com parâmetros posicionais | Prisma Migrate (só o esquema; o Prisma Client não é usado) |
| PHP | PDO com *prepared statements* | Doctrine Migrations |
| Java | `JdbcClient` do Spring com SQL escrito à mão | Flyway |

No Java não existe um ORM de migrations no mesmo sentido: o Hibernate só gera o esquema, sem versionar. O Flyway é o padrão do ecossistema e o desvio fica explicado no README.

## Log de auditoria

Pedido do usuário depois do plano inicial: gravar o que foi feito e quem fez, em toda escrita no banco, com uma tabela e um endpoint para ler o log de um usuário por período. Vale nas três trilhas.

O que é gravado: toda escrita de negócio gera UMA linha em `audit_logs`, NA MESMA TRANSAÇÃO da escrita. Se a escrita falhar, não há log; se o log falhar, a escrita é desfeita.

| Ação (`action`) | Quando | `entity_type` / `entity_id` | `changes` |
| --- | --- | --- | --- |
| `product.created` | `POST /products` | product / id | `{"after": {...}}` |
| `product.updated` | `PUT /products/{id}` | product / id | `{"before": {...}, "after": {...}}` só com os campos que mudaram |
| `product.visibility_changed` | `PATCH /products/{id}/visibility` | product / id | `{"before": {"visible": x}, "after": {"visible": y}}` |
| `product.reordered` | `PUT /products/order` | product / null | `{"after": {"ids": [...]}}` |
| `product.deleted` | `DELETE /products/{id}` | product / id | `{"before": {...}}`, com quantas promoções caíram junto |
| `promotion.created` / `promotion.updated` / `promotion.deleted` | rotas de promoção | promotion / id | mesmo padrão de/para, janelas incluídas |
| `user.created` / `user.deleted` | rotas de usuário | user / id | nome e e-mail; nunca senha nem hash |
| `auth.password_reset_requested` | `forgot-password` com e-mail existente | user / id | `{}`; o ator é o próprio usuário |
| `auth.password_reset` | `reset-password` com sucesso | user / id | `{}` |

Não registra leituras, login nem pedido de recuperação para e-mail inexistente (não há usuário a quem atribuir; o limite de 429 continua na tabela de pedidos). Nunca grava senha, hash, token ou JWT.

Desenho comum:

- Porta `AuditLog` (`record(entry)`) na camada de aplicação de `shared`, implementação SQL na infraestrutura; só INSERT.
- O "quem" é um `Actor` (id, e-mail e restaurante do token, mais o IP da requisição) que a camada HTTP passa ao caso de uso; o domínio não sabe de HTTP.
- Atomicidade por uma porta `TransactionManager` na aplicação: o caso de uso envolve a escrita e o `record()` numa transação só. Em memória nos testes de caso de uso.
- A hora vem do `Clock`, não do `now()` do banco.

Endpoint: `GET /api/v1/users/{id}/audit-logs?dateIni=2026-11-25&dateEnd=2026-11-26&page=1&perPage=50` (JWT).

- `{id}` é o usuário cujas ações se quer ver. Usuário de outro restaurante ou inexistente: 404. Usuário já excluído, mas com log no restaurante: devolve o log normalmente.
- `dateIni` é obrigatório e `dateEnd` é opcional (sem ele, vai até agora), no formato `AAAA-MM-DD`. Os dias são inclusivos e interpretados no fuso do restaurante. Data inválida ou `dateEnd` antes de `dateIni`: 422 com `errors` por campo.
- Resposta 200, mais recentes primeiro, paginada como `/products`:

```json
{
  "data": [
    {
      "id": 42,
      "action": "promotion.created",
      "entityType": "promotion",
      "entityId": 9,
      "changes": { "after": { "productId": 8, "description": "Sexta da caipirinha", "price": 1500, "windows": [] } },
      "ip": "172.18.0.1",
      "createdAt": "2026-11-25T18:31:04-03:00"
    }
  ],
  "user": { "id": 1, "email": "admin@bardojoao.com" },
  "meta": { "page": 1, "perPage": 50, "total": 1 }
}
```

## Arquitetura limpa, testes e Docker (comum às três trilhas)

&#91;embedded content: arquitetura · 4 camadas, mesma regra nas 3 trilhas\]

O domínio não importa nada de framework, banco ou HTTP: dá para testá-lo só com `new`. Cada ação de negócio é um caso de uso próprio, que recebe um DTO de entrada e devolve um DTO de saída. A ligação entre interfaces e implementações fica num único ponto de composição (o `container` ou a configuração de injeção), e a organização de pastas é por módulo (`product`, `promotion`, `menu`, `auth`), não por tipo técnico.

Objetos de valor do domínio que aparecem nas três trilhas: `Money` (centavos, nunca negativo), `Category` (enum), `Weekday`, `TimeOfDay` (`HH:mm` com minutos de 15 em 15), `TimeWindow` (início e fim, com a regra dos 15 minutos e a checagem de sobreposição) e `Timezone`.

Estratégia de testes:

| Nível | O que cobre | Como roda |
| --- | --- | --- |
| Unitário de domínio | Regras de `TimeWindow`, `Money`, preço promocional, promoção ativa num dado dia e hora | Sem banco, sem framework, em milissegundos |
| Caso de uso | Fluxos de criação, conflito de horário, cardápio com relógio fixo em fusos diferentes | Repositórios em memória e `Clock` fixo |
| Integração | Cada repositório SQL cumprindo o contrato da interface, incluindo a consulta do cardápio e a restrição de sobreposição | Postgres real via Testcontainers |
| Ponta a ponta | Rotas, códigos HTTP, 401 sem token, cardápio público sem token | API subindo contra o banco de teste |
| Arquitetura | Domínio sem importar infraestrutura nem framework | Regra automática no CI (dependency-cruiser, Deptrac ou ArchUnit) |

Meta: 90% de cobertura em domínio e aplicação; nas camadas de fora, vale mais cobrir os caminhos de erro do que o número.

Docker e entrega, iguais nas três trilhas:

- `docker compose up` sobe `db` (Postgres com healthcheck), `migrate` (roda as migrations e o seed e encerra) e `api` (só começa quando a migration termina).
- Dockerfile multi-stage: uma etapa com as ferramentas de build e testes, e uma imagem final enxuta, com usuário não-root.
- `Makefile` com `up`, `down`, `test`, `test-integration`, `lint` e `logs`, para o avaliador não precisar conhecer a stack.
- GitHub Actions rodando lint, análise estática e todos os níveis de teste a cada push.
- OpenAPI gerado a partir do código e servido em `/docs` em modo de desenvolvimento.
- `.env.example` versionado; segredos fora do Git.

Para o e-mail, o Compose também sobe o `mailpit`: ele recebe tudo pelo SMTP na porta 1025 e mostra a caixa de entrada em `localhost:8025`. Os testes de ponta a ponta da recuperação de senha leem o e-mail pela API do Mailpit para pegar o token.

## Cronogramas por trilha

As três trilhas seguem as mesmas fases, na mesma ordem: fundação com Docker e migrations, domínio com testes, produtos, promoções, autenticação, cardápio e, por último, opcionais e README. Repetir a ordem é o que permite comparar as linguagens no fim, e a coleção de testes de ponta a ponta da trilha 1 vira o critério de aceite das outras duas.

Cronograma de cada trilha, semana a semana:

- Trilha 1 — TypeScript, semanas 1 a 5
- Trilha 2 — PHP, semanas 6 a 9
- Trilha 3 — Java, semanas 10 a 15

Com 4 h por semana, dobre cada trilha sem mudar a ordem. Se este plano for rodar em paralelo com os laboratórios do Use a Cabeça! C#, divida as horas semanais entre os dois e estique as datas de ambos.
