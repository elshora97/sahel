.RECIPEPREFIX = >
.DEFAULT_GOAL = help
COMPOSE = docker compose -f infra/docker-compose.yml --env-file .env
GOOSE_DIR = infra/migrations

help:
> @grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | sed 's/:.*##/ -/'

dev: ## Postgres + MinIO + API in docker, Next.js on the host
> $(COMPOSE) up -d --build
> @echo "api      http://localhost:8080/healthz"
> @echo "minio    http://localhost:9001 (console)"
> @echo "starting next.js - open http://localhost:3000/ar"
> cd web && npm install && npm run dev

up: ## Backend services only
> $(COMPOSE) up -d --build

down: ## Stop everything, keep volumes
> $(COMPOSE) down

nuke: ## Stop everything and drop the database volume
> $(COMPOSE) down -v

logs: ## Tail the API logs
> $(COMPOSE) logs -f api

migrate: ## Apply all migrations
> $(COMPOSE) run --rm api go run github.com/pressly/goose/v3/cmd/goose@v3.24.1 -dir /migrations postgres "$$DATABASE_URL" up

migrate-down: ## Roll back one migration
> $(COMPOSE) run --rm api go run github.com/pressly/goose/v3/cmd/goose@v3.24.1 -dir /migrations postgres "$$DATABASE_URL" down

migrate-status: ## Show migration status
> $(COMPOSE) run --rm api go run github.com/pressly/goose/v3/cmd/goose@v3.24.1 -dir /migrations postgres "$$DATABASE_URL" status

sqlc: ## Regenerate the store layer from queries
> cd api && go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate

test: ## Go tests, then a web typecheck
> cd api && go test ./...
> cd web && npm run typecheck

seed: ## Load seed data (phase 2)
> @echo "no seed data yet - lands in phase 2"

.PHONY: help dev up down nuke logs migrate migrate-down migrate-status sqlc test seed
