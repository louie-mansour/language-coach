# Override if you use the standalone CLI: make DOCKER_COMPOSE="docker-compose" up-debug
DOCKER_COMPOSE ?= docker compose

# Hot reload: src/ mounted, tsx watch (see docker-compose.dev.yml).
COMPOSE := $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_DEBUG := $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.debug.yml
# Production-style image (no bind mount): docker compose -f docker-compose.yml up --build
COMPOSE_PROD := $(DOCKER_COMPOSE) -f docker-compose.yml

# Extra args for compose, e.g. make up-debug ARGS=-d
ARGS ?=

# curl targets (host port must match docker-compose ${PORT:-3000}:3000)
PORT ?= 3000
# If PORT is exported but empty, curl sees http://localhost:/... (port 80). Force a real default.
DOMAIN ?= localhost
HOST_API_PORT := $(if $(strip $(PORT)),$(PORT),3000)
PHONE ?= +15551234567
MSG ?= Hello
# For curl-health / curl-message: set in your shell (e.g. `export API_KEY=...`) or pass `make curl-health API_KEY=...` (see .env).
API_KEY ?=

# Isolated DB for integration tests (compose Postgres on localhost:5432; does not use dev DB name)
TEST_DB_NAME ?= languagecoach_test
TEST_DATABASE_URL ?= postgresql://languagecoach:languagecoach@127.0.0.1:5432/$(TEST_DB_NAME)

.PHONY: help up up-debug up-prod down down-v logs psql test curl-health curl-message

help:
	@echo "Docker Compose (language-coach)"
	@echo "  make up          - api + postgres, hot reload (edit src/ on host; tsx watch in container)"
	@echo "  make up-debug    - same + Node inspector on localhost:9229 (attach from Cursor/VS Code)"
	@echo "  make up-prod     - no hot reload: run compiled dist/ from image (like old make up)"
	@echo "  make down        - stop stack"
	@echo "  make down-v      - stop and remove volumes (wipes Postgres data)"
	@echo "  make logs        - follow api + postgres logs"
	@echo "  make psql        - open psql in the postgres container"
	@echo "  make test        - start compose Postgres if needed, ensure $(TEST_DB_NAME) exists, run vitest (isolated from dev DB)"
	@echo "  make curl-health - GET /health (needs API_KEY; default http://localhost:$(HOST_API_PORT)/health)"
	@echo "  make curl-message MSG='...' - POST /message (MSG is required for your text; needs API_KEY)"
	@echo "    WRONG: make curl-message 'your text' — Make treats that as extra targets; default MSG (Hello) is sent."
	@echo "    optional: PHONE=... PORT=...  or: npm run curl-message -- your words here"
	@echo "Optional: ARGS=-d for detached, e.g. make up-debug ARGS=-d"
	@echo "  After changing package.json deps, recreate node_modules volume: make down-v && make up"
	@echo "  or: docker compose run --rm api pnpm install"

up:
	$(COMPOSE) up --build $(ARGS)

up-debug:
	$(COMPOSE_DEBUG) up --build $(ARGS)

up-prod:
	$(COMPOSE_PROD) up --build $(ARGS)

down:
	$(COMPOSE) down $(ARGS)

down-v:
	$(COMPOSE) down -v $(ARGS)

logs:
	$(COMPOSE) logs -f

psql:
	$(DOCKER_COMPOSE) -f docker-compose.yml exec postgres psql -U languagecoach -d languagecoach

test:
	@sh "$(CURDIR)/scripts/ensure-test-db.sh"
	@DATABASE_URL="$(TEST_DATABASE_URL)" sh -c 'command -v pnpm >/dev/null 2>&1 && pnpm test || npm test'

curl-health:
	curl -sS "http://$(DOMAIN):$(HOST_API_PORT)/health" \
		-H "x-api-key: $(API_KEY)"

# JSON body via Node; single-quoted -p script avoids nested " breaking /bin/sh -d "..." .
# process.env["MSG"] not .MSG so Make does not treat $(MSG) as a variable reference.
curl-message:
	@extras='$(filter-out curl-message,$(MAKECMDGOALS))'; \
	if [ -n "$$extras" ]; then \
		echo >&2 'error: words after curl-message are Make targets, not your SMS. Nothing was sent as you intended.'; \
		echo >&2 "  try: make curl-message MSG='$$extras'"; \
		echo >&2 '  or:  npm run curl-message -- '"'"'...'"'"''; \
		exit 2; \
	fi; \
	MSG="$(MSG)" PHONE="$(PHONE)" \
		curl -sS -X POST "http://$(DOMAIN):$(HOST_API_PORT)/message" \
		-H 'Content-Type: application/json' \
		-H "x-api-key: $(API_KEY)" \
		-d "$$(node -p 'JSON.stringify({channel:"sms",phoneNumber:process.env["PHONE"]||"+15551234567",message:process.env["MSG"]||"Hello"})')"
