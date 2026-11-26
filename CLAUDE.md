# Goomer Menu API (TypeScript)

Trilha 1 do plano em `docs/visao-geral.md` (o contrato comum: regras, rotas, esquema e testes). Node 22 + Fastify 5 +
`pg`, TypeScript estrito, arquitetura limpa organizada por módulo. Convenções detalhadas na skill
`.claude/skills/goomer-ts/SKILL.md`.

## Ambiente

- Sem Node no host: tudo roda em container. `make` pode não estar instalado; use o `docker compose` equivalente do `Makefile`.
- Subir: `docker compose up -d --build` (API em `localhost:8091`, Mailpit em `localhost:8027`, Postgres sem porta no host).
- Testes: `docker compose --profile test run --rm test npx vitest run [--project unit|usecase|integration|e2e]`.
  Integração e ponta a ponta sobem o Postgres via Testcontainers (o serviço `test` monta o socket do Docker).
- Qualidade: `... run --rm test npm run check` (ESLint + Prettier, `tsc --noEmit`, dependency-cruiser).

## Regras que não se negociam

- `domain` não importa nada de fora do domínio (nem application, nem pacote npm, nem `node:*`). O dependency-cruiser barra.
- SQL escrito à mão com parâmetros posicionais (`$1`) no `pg`; Prisma Migrate só para o esquema (o Client não é usado).
- O restaurante das rotas protegidas vem sempre do token (`authOf(request)`), nunca da URL. Recurso de outro restaurante é 404.
- Erros em Problem Details; preços em centavos (`Money`); hora "agora" sempre via `Clock`.
- Toda escrita de negócio passa pelo `Auditor` (escrita + `audit_logs` na mesma transação); nunca grave senha, hash ou token no log.
- `strict` + `noUncheckedIndexedAccess`, ESLint `strictTypeChecked` limpo, cobertura de domain e application >= 90%
  (o Vitest falha abaixo disso).

## Git

- Uma branch por funcionalidade (`feature/<nome>`), fast-forward na `main`; nunca commit direto na `main`.
- Commits `tipo(escopo): descrição`, até 200 caracteres, sem Co-Authored-By. No máximo 6 arquivos e 600 linhas por commit.
- Hooks em `.githooks` (`git config core.hooksPath .githooks`); o `pre-push` roda lint, tsc, dependency-cruiser e testes unitários.
