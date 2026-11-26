# Atalhos para quem não conhece a stack: tudo roda em containers (não precisa de Node no host).
COMPOSE = docker compose
TEST = $(COMPOSE) --profile test run --rm test

.PHONY: up down logs test test-unit test-integration coverage lint fix create-admin

up: ## Sobe db, migrate (migrations + seed), api (localhost:8091) e mailpit (localhost:8027)
	$(COMPOSE) up -d --build

down: ## Derruba os containers (o volume do banco fica)
	$(COMPOSE) down

logs: ## Acompanha os logs da API
	$(COMPOSE) logs -f api

test: ## Todos os níveis: unitário, caso de uso, integração e ponta a ponta
	$(TEST) npm test

test-unit: ## Só unitário e caso de uso (sem banco)
	$(TEST) npm run test:unit

test-integration: ## Integração e ponta a ponta (Postgres via Testcontainers + Mailpit)
	$(TEST) npm run test:integration

coverage: ## Cobertura de domain e application (meta: 90%, o Vitest falha abaixo disso)
	$(TEST) npm run coverage

lint: ## ESLint + Prettier, tsc --noEmit e dependency-cruiser (camadas)
	$(TEST) npm run check

fix: ## Formata o código com o Prettier
	$(TEST) npm run format

create-admin: ## Ex.: make create-admin EMAIL=ana@bar.com PASSWORD=segredo123 NAME="Ana" RESTAURANT=1
	$(COMPOSE) run --rm migrate node dist/bin/create-admin.js --email="$(EMAIL)" --password="$(PASSWORD)" --name="$(or $(NAME),Administrador)" --restaurant="$(or $(RESTAURANT),1)"
