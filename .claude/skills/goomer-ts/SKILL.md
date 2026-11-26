---
name: goomer-ts
description: Convenções da Goomer Menu API em TypeScript (Fastify 5, pg, Prisma Migrate, arquitetura limpa por módulo). Use ao criar ou mudar caso de uso, entidade, repositório, rota, migration ou teste neste repositório.
---

# Convenções da Goomer Menu API (TypeScript)

## Onde cada coisa mora

```
src/<módulo>/domain          entidades, objetos de valor, erros e interfaces de repositório (TypeScript puro)
src/<módulo>/application     um caso de uso por ação (`XxxUseCase.execute`), DTOs de entrada e saída, portas
src/<módulo>/infrastructure  pg, jose (JWT), argon2, nodemailer
src/<módulo>/http            rotas Fastify finas, com schema TypeBox (validação + OpenAPI)
src/shared/...               Money, Weekday, TimeOfDay, TimeWindow, Timezone, Clock, Problem Details, Database
src/bootstrap                container.ts (único ponto de composição), config.ts e http-app.ts
prisma/                      schema.prisma (documenta) e migrations/*/migration.sql (SQL à mão)
```

Módulos: `product`, `promotion`, `menu`, `auth`, `user`, mais `shared`. Imports ESM com extensão `.js`.

## Receitas

- **Nova regra de negócio**: entra na entidade ou no objeto de valor, lançando `ValidationError` (422), `NotFound` (404)
  ou `Conflict` (409). Teste em `tests/unit`, só com `new`/`create`, sem banco.
- **Novo caso de uso**: classe em `application` com `execute(...)` assíncrono, recebe primitivos ou um DTO e devolve
  DTO. Teste em `tests/usecase` com os repositórios em memória de `tests/support/in-memory.ts` e `FixedClock`.
- **Nova consulta**: SQL à mão no repositório pg (`Database.query/one/int/transactional`), parâmetros `$1, $2...`.
  Teste em `tests/integration` com `TestDatabase.reset()` (Postgres do Testcontainers).
- **Nova rota**: função `xxxRoutes(app, deps)` em `http`, schema TypeBox no `schema.body/querystring`, ler com
  `bodyOf`/`queryOf`, id com `routeId`, contexto com `authOf`. Registrar em `src/bootstrap/http-app.ts` dentro ou fora
  do escopo protegido. Teste em `tests/e2e` com `Api.setup()` (`app.inject`).
- **Mudança de esquema**: nova pasta `prisma/migrations/AAAAMMDDhhmmss_nome/migration.sql` com SQL escrito à mão, e o
  modelo correspondente em `schema.prisma`; regras que dá para garantir no banco (CHECK, EXCLUDE, FK) entram também lá.
- **Nova porta**: interface em `application` (ou `domain`, se for repositório), implementação em `infrastructure`,
  ligação em `src/bootstrap/container.ts`.

## Checklist antes do commit

1. `npm run check` limpo (ESLint + Prettier, `tsc --noEmit`, dependency-cruiser).
2. Testes do nível certo passando; `npm run coverage` (domain e application >= 90%).
3. Commit `tipo(escopo): descrição` (<= 200 caracteres), <= 6 arquivos e 600 linhas, na branch `feature/<nome>`.
