# Override if you use the standalone CLI: make DOCKER_COMPOSE="docker-compose" up-debug
DOCKER_COMPOSE ?= docker compose

COMPOSE := $(DOCKER_COMPOSE) -f docker-compose.yml
COMPOSE_DEBUG := $(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.debug.yml

# Extra args for compose, e.g. make up-debug ARGS=-d
ARGS ?=

# curl targets (host port must match docker-compose ${PORT:-3000}:3000)
PORT ?= 3000
# If PORT is exported but empty, curl sees http://localhost:/... (port 80). Force a real default.
HOST_API_PORT := $(if $(strip $(PORT)),$(PORT),3000)
PHONE ?= +15551234567
MSG ?= Hello

.PHONY: help up up-debug down down-v logs psql curl-health curl-message

help:
	@echo "Docker Compose (language-coach)"
	@echo "  make up          - build and run api + postgres"
	@echo "  make up-debug    - same + Node inspector on localhost:9229 (attach from Cursor/VS Code)"
	@echo "  make down        - stop stack"
	@echo "  make down-v      - stop and remove volumes (wipes Postgres data)"
	@echo "  make logs        - follow api + postgres logs"
	@echo "  make psql        - open psql in the postgres container"
	@echo "  make curl-health - GET /health (default http://localhost:$(HOST_API_PORT)/health)"
	@echo "  make curl-message MSG='...' - POST /message (MSG is required for your text)"
	@echo "    WRONG: make curl-message 'your text' — Make treats that as extra targets; default MSG (Hello) is sent."
	@echo "    optional: PHONE=... PORT=...  or: npm run curl-message -- your words here"
	@echo "Optional: ARGS=-d for detached, e.g. make up-debug ARGS=-d"

up:
	$(COMPOSE) up --build $(ARGS)

up-debug:
	$(COMPOSE_DEBUG) up --build $(ARGS)

down:
	$(COMPOSE) down $(ARGS)

down-v:
	$(COMPOSE) down -v $(ARGS)

logs:
	$(COMPOSE) logs -f

psql:
	$(DOCKER_COMPOSE) -f docker-compose.yml exec postgres psql -U languagecoach -d languagecoach

curl-health:
	curl -sS "http://localhost:$(HOST_API_PORT)/health"

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
		curl -sS -X POST "http://localhost:$(HOST_API_PORT)/message" \
		-H 'Content-Type: application/json' \
		-d "$$(node -p 'JSON.stringify({phoneNumber:process.env["PHONE"]||"+15551234567",message:process.env["MSG"]||"Hello"})')"
